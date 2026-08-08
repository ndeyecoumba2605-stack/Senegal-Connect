const express = require('express');
const { verifierJWT, garderRole } = require('../middleware/auth');
const utilisateursController = require('../controllers/utilisateursController');

const router = express.Router();

/**
 * @openapi
 * /api/utilisateurs:
 *   get:
 *     summary: Liste des comptes internes (agents et admins)
 *     tags: [Utilisateurs]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [agent, admin] }
 *     responses:
 *       200: { description: Liste des comptes internes }
 */
router.get('/', verifierJWT, garderRole('admin'), utilisateursController.lister);

/**
 * @openapi
 * /api/utilisateurs/{id}:
 *   delete:
 *     summary: Supprime un compte agent ou admin
 *     tags: [Utilisateurs]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Supprimé }
 *       400: { description: "Compte non éligible ou auto-suppression" }
 *       404: { description: Introuvable }
 */
router.delete('/:id', verifierJWT, garderRole('admin'), utilisateursController.supprimer);

module.exports = router;
