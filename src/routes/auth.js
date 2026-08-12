const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  inscrire,
  inscrireInterne,
  inscrireClient,
  connecter,
  profil,
  demanderReinitialisation,
  reinitialiserMotDePasse,
} = require('../controllers/authController');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Inscription publique d'un nouveau client
 *     description: Crée un compte client sans nécessiter de token. Le rôle est toujours forcé à client.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe]
 *             properties:
 *               nom: { type: string, example: 'Awa' }
 *               prenom: { type: string, example: 'Diop' }
 *               email: { type: string, example: 'awa.diop@senegalconnect.sn' }
 *               mot_de_passe: { type: string, example: 'MotDePasse123' }
 *               role: { type: string, example: 'client' }
 *     responses:
 *       201:
 *         description: Client créé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Non autorisé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       422:
 *         description: Requête invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/register-interne:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Création d'un agent ou administrateur
 *     description: Permet à un administrateur connecté de créer un agent ou un admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe, role]
 *             properties:
 *               nom: { type: string, example: 'Moussa' }
 *               prenom: { type: string, example: 'Ba' }
 *               email: { type: string, example: 'moussa.ba@senegalconnect.sn' }
 *               mot_de_passe: { type: string, example: 'MotDePasse123' }
 *               role: { type: string, enum: [agent, admin], example: 'agent' }
 *     responses:
 *       201:
 *         description: Utilisateur interne créé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Rôle insuffisant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       422:
 *         description: Données invalides
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/inscription-client:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Inscription client self-care
 *     description: Crée automatiquement un client et renvoie un token JWT pour la connexion.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, mot_de_passe, msisdn, forfait_id]
 *             properties:
 *               nom: { type: string, example: 'Awa' }
 *               prenom: { type: string, example: 'Ndiaye' }
 *               email: { type: string, example: 'awa.ndiaye@senegalconnect.sn' }
 *               mot_de_passe: { type: string, example: 'MotDePasse123' }
 *               msisdn: { type: string, example: '+221771234567' }
 *               forfait_id: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Inscription réussie avec token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       422:
 *         description: Requête invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Connexion utilisateur
 *     description: Authentifie un utilisateur et renvoie un JWT utilisable dans Swagger UI.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *             properties:
 *               email: { type: string, example: 'awa.ndiaye@senegalconnect.sn' }
 *               mot_de_passe: { type: string, example: 'MotDePasse123' }
 *     responses:
 *       200:
 *         description: Authentification réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Identifiants incorrects
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       422:
 *         description: Requête invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/profil:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Récupération du profil connecté
 *     description: Renvoie les informations de l'utilisateur authentifié.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil de l'utilisateur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Token manquant ou expiré
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/mot-de-passe-oublie:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Demande de réinitialisation de mot de passe
 *     description: Envoie un message de réinitialisation si le compte existe, sans révéler l'existence du compte.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: 'awa.ndiaye@senegalconnect.sn' }
 *     responses:
 *       200:
 *         description: Demande acceptée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       422:
 *         description: Requête invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 * /api/auth/reinitialiser-mot-de-passe:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Réinitialisation de mot de passe
 *     description: Valide le token temporaire et met à jour le mot de passe du compte.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, nouveau_mot_de_passe]
 *             properties:
 *               token: { type: string, example: 'abc123def456...' }
 *               nouveau_mot_de_passe: { type: string, example: 'NouveauMotDePasse123' }
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Token invalide ou expiré
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       422:
 *         description: Requête invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
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

// Inscription publique: le rôle est toujours client, même si un champ role est envoyé.
router.post(
  '/register',
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').isLength({ min: 6 }).withMessage('6 caractères minimum'),
    body('role').optional().equals('client').withMessage('Une inscription publique crée uniquement un client'),
  ],
  validerRequete,
  inscrire
);

// Création d'un agent/admin: route séparée et protégée, utilisée par le back-office.
router.post(
  '/register-interne',
  verifierJWT,
  garderRole('admin'),
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    body('email').isEmail().withMessage('Email invalide'),
    body('mot_de_passe').isLength({ min: 6 }).withMessage('6 caractères minimum'),
    body('role').isIn(['agent', 'admin']).withMessage('Le rôle doit être agent ou admin'),
  ],
  validerRequete,
  inscrireInterne
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
