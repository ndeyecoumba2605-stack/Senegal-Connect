const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifierJWT, garderRole } = require('../middleware/auth');
const forfaitsController = require('../controllers/forfaitsController');

const router = express.Router();

const validerForfait = [
  body('nom').notEmpty(),
  body('quota_data_go').isInt({ min: 0 }),
  body('quota_voix_min').isInt({ min: 0 }),
  body('prix_mensuel_fcfa').isInt({ min: 1 }).withMessage('Le prix doit être supérieur à 0'),
];

router.get('/', async (req, res, next) => {
  try {
    const forfaits = await forfaitsController.lister();
    res.json({ data: forfaits });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const forfait = await forfaitsController.detail(req.params.id, req.query.page, req.query.limite);
    if (!forfait) return res.status(404).json({ message: 'Forfait introuvable' });
    res.json(forfait);
  } catch (err) { next(err); }
});

router.post('/', verifierJWT, garderRole('admin'), validerForfait, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const forfait = await forfaitsController.creer(req.body);
    res.status(201).json(forfait);
  } catch (err) { next(err); }
});

router.put('/:id', verifierJWT, garderRole('admin'), validerForfait, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const forfait = await forfaitsController.modifier(req.params.id, req.body);
    if (!forfait) return res.status(404).json({ message: 'Forfait introuvable' });
    res.json(forfait);
  } catch (err) { next(err); }
});

router.delete('/:id', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    await forfaitsController.supprimer(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.statut409) return res.status(409).json({ message: err.message });
    next(err);
  }
});

module.exports = router;