const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifierJWT, garderRole } = require('../middleware/auth');
const facturesController = require('../controllers/facturesController');

const router = express.Router();

router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { client_id, statut, periode, page, limite } = req.query;
    const resultat = await facturesController.lister({ clientId: client_id, statut, periode, page, limite });
    res.json(resultat);
  } catch (err) { next(err); }
});

router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const facture = await facturesController.detail(req.params.id);
    if (!facture) return res.status(404).json({ message: 'Facture introuvable' });
    res.json(facture);
  } catch (err) { next(err); }
});

router.post('/',
  verifierJWT, garderRole('admin'),
  [
    body('client_id').isInt(),
    body('periode').matches(/^\d{4}-\d{2}$/).withMessage('Format attendu : YYYY-MM'),
    body('montant_fcfa').isInt({ min: 0 }),
  ],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
    }
    try {
      const facture = await facturesController.creer(req.body);
      res.status(201).json(facture);
    } catch (err) { next(err); }
  }
);

router.put('/:id/statut',
  verifierJWT, garderRole('admin'),
  [body('statut').isIn(['payee', 'impayee', 'en_retard'])],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });
    try {
      const facture = await facturesController.changerStatut(req.params.id, req.body.statut);
      if (!facture) return res.status(404).json({ message: 'Facture introuvable' });
      res.json(facture);
    } catch (err) { next(err); }
  }
);

module.exports = router;