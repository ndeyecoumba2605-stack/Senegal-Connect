const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/ticketsController');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     summary: Lister les tickets de support
 *     tags: [Tickets Support]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des tickets attribués ou créés
 */
router.get('/', verifierJWT, ticketsController.lister);

/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     summary: Obtenir les détails et messages d'un ticket
 *     tags: [Tickets Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket et échanges trouvés
 *       404:
 *         description: Ticket introuvable
 */
router.get('/:id', verifierJWT, ticketsController.obtenirParId);

/**
 * @openapi
 * /api/tickets:
 *   post:
 *     summary: Ouvrir un nouveau ticket d'incident ou d'assistance
 *     tags: [Tickets Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sujet, description]
 *             properties:
 *               sujet:
 *                 type: string
 *                 example: Perte de connexion secteur Almadies
 *               description:
 *                 type: string
 *                 example: Voyant rouge clignotant sur le routeur depuis 08h00.
 *               priorite:
 *                 type: string
 *                 enum: [basse, moyenne, haute, urgente]
 *                 default: moyenne
 *     responses:
 *       201:
 *         description: Ticket créé avec succès
 */
router.post('/', verifierJWT, ticketsController.creer);

/**
 * @openapi
 * /api/tickets/{id}/statut:
 *   patch:
 *     summary: Mettre à jour le statut d'un ticket (Ex. : 'en_cours', 'resolu', 'ferme')
 *     tags: [Tickets Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [statut]
 *             properties:
 *               statut:
 *                 type: string
 *                 enum: [ouvert, en_cours, resolu, ferme]
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.patch('/:id/statut', verifierJWT, garderRole('admin', 'agent'), ticketsController.changerStatut);

/**
 * @openapi
 * /api/tickets/{id}/messages:
 *   post:
 *     summary: Ajouter une réponse à un ticket
 *     tags: [Tickets Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: Un technicien est en route vers votre domicile.
 *     responses:
 *       201:
 *         description: Message ajouté au ticket
 */
router.post('/:id/messages', verifierJWT, ticketsController.ajouterMessage);

module.exports = router;