const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/clientsController');
const { verifierJWT, garderRole } = require('../middleware/auth');

const router = express.Router();

function validerRequete(req, res, next) {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({
      erreurs: erreurs.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value })),
    });
  }
  next();
}

const validationClient = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('msisdn').matches(/^\+221[0-9]{9}$/).withMessage('Format attendu : +221XXXXXXXXX'),
  body('forfait_id').isInt().withMessage('forfait_id doit être un entier'),
];

router.get('/', verifierJWT, ctrl.lister);
router.get('/:id', verifierJWT, param('id').isInt(), validerRequete, ctrl.obtenirDetail);
router.post('/', verifierJWT, garderRole('admin'), validationClient, validerRequete, ctrl.creer);
router.put('/:id', verifierJWT, garderRole('admin'), validationClient, validerRequete, ctrl.modifier);
router.patch(
  '/:id/statut',
  verifierJWT,
  garderRole('admin'),
  body('statut').isIn(['actif', 'suspendu', 'resilie']).withMessage('Statut invalide'),
  validerRequete,
  ctrl.changerStatut
);
router.delete('/:id', verifierJWT, garderRole('admin'), ctrl.supprimer);

module.exports = router;
const clientsController = require('../controllers/clientsController');



const validerClient = [
  body('msisdn').matches(/^\+221[0-9]{9}$/).withMessage('Format attendu : +221XXXXXXXXX'),
  body('email').isEmail().withMessage('Email invalide'),
  body('forfait_id').isInt().withMessage('forfait_id doit être un entier'),
];

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: Liste paginée des clients
 *     tags: [Clients]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: forfait_id
 *         schema: { type: integer }
 *       - in: query
 *         name: statut
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limite
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Liste paginée
 */
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { q, forfait_id, statut, page, limite } = req.query;
    const resultat = await clientsController.lister({ q, forfaitId: forfait_id, statut, page, limite });
    res.json(resultat);
  } catch (err) { next(err); }
});

router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const client = await clientsController.detail(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (err) { next(err); }
});

router.post('/', verifierJWT, garderRole('admin'), validerClient, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const client = await clientsController.creer(req.body);
    res.status(201).json(client);
  } catch (err) { next(err); }
});

router.put('/:id', verifierJWT, garderRole('admin'), validerClient, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const client = await clientsController.modifier(req.params.id, req.body);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });
    res.json(client);
  } catch (err) { next(err); }
});

router.patch('/:id/statut',
  verifierJWT, garderRole('admin'),
  [body('statut').isIn(['actif', 'suspendu', 'resilie'])],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

    try {
      const client = await clientsController.changerStatut(req.params.id, req.body.statut);
      res.json(client);
    } catch (err) {
      if (err.statut409) return res.status(409).json({ message: err.message });
      next(err);
    }
  }
);

router.delete('/:id', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    await clientsController.supprimer(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.statut409) return res.status(409).json({ message: err.message });
    next(err);
  }
});

module.exports = router;