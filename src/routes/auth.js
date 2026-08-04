const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifierJWT, garderRole } = require('../middlewares/auth');

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Inscription d'un nouvel utilisateur (Rôle forcé à client)
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe, nom, prenom]
 *     responses:
 *       201:
 *         description: Utilisateur créé avec succès
 */
router.post('/register', (req, res, next) => {
  // Sécurisation : Forcer le rôle 'client' pour toute inscription publique
  req.body.role = 'client';
  authController.inscrire(req, res, next);
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Connexion utilisateur et génération de JWT
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *     responses:
 *       200:
 *         description: Connexion réussie, jeton retourné
 */
router.post('/login', authController.connecter);

/**
 * @openapi
 * /api/auth/demande-reinitialisation-mdp:
 *   post:
 *     summary: Demander un jeton de réinitialisation de mot de passe
 *     tags: [Authentification]
 */
router.post('/demande-reinitialisation-mdp', authController.demandeReinitialisationMdp);

/**
 * @openapi
 * /api/auth/reinitialiser-mot-de-passe:
 *   post:
 *     summary: Réinitialiser le mot de passe avec le jeton
 *     tags: [Authentification]
 */
router.post('/reinitialiser-mot-de-passe', authController.reinitialiserMdp);

module.exports = router;