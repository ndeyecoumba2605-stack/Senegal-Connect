const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/clients.controller');
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
