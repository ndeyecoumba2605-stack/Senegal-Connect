const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  inscrire,
  inscrireClient,
  connecter,
  profil,
  demanderReinitialisation,
  reinitialiserMotDePasse,
} = require('../controllers/authController');
const { verifierJWT } = require('../middleware/auth');

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

router.post(
  '/register',
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').isLength({ min: 6 }).withMessage('6 caractères minimum'),
    body('role').isIn(['client', 'agent', 'admin']).withMessage('Rôle invalide'),
  ],
  validerRequete,
  inscrire
);

router.post(
  '/inscription-client',
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').isLength({ min: 6 }).withMessage('6 caractères minimum'),
    body('msisdn').matches(/^\+221[0-9]{9}$/).withMessage('Format attendu : +221XXXXXXXXX'),
    body('forfait_id').isInt().withMessage('forfait_id doit être un entier'),
  ],
  validerRequete,
  inscrireClient
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
  ],
  validerRequete,
  connecter
);

router.get('/profil', verifierJWT, profil);

router.post(
  '/mot-de-passe-oublie',
  body('email').isEmail().withMessage('Email invalide'),
  validerRequete,
  demanderReinitialisation
);

router.post(
  '/reinitialiser-mot-de-passe',
  [
    body('token').notEmpty().withMessage('Token requis'),
    body('nouveau_mot_de_passe').isLength({ min: 6 }).withMessage('6 caractères minimum'),
  ],
  validerRequete,
  reinitialiserMotDePasse
);

module.exports = router;
