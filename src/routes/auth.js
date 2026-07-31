const express = require('express');
const { body, validationResult } = require('express-validator');
const { inscrire, connecter, profil } = require('../controllers/auth.controller');
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
  '/login',
  [
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
  ],
  validerRequete,
  connecter
);

router.get('/profil', verifierJWT, profil);

module.exports = router;
