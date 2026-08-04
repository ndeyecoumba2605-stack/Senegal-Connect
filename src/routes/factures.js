const express = require('express');
const router = express.Router();
const facturesController = require('../controllers/facturesController');
const { verifierJWT, garderRole } = require('../middleware/auth');

/**
 * @openapi
 * /api/factures:
 *   get:
 *     summary: Obtenir la liste des factures
 *     description: Les clients voient uniquement leurs factures; les admins et agents voient toutes les factures.
 *     tags: [Factures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des factures récupérée
 *       401:
 *         description: Non authentifié
 */
router.get('/', verifierJWT, facturesController.lister);

/**
 * @openapi
 * /api/factures/{id}:
 *   get:
 *     summary: Consulter le détail d'une facture
 *     tags: [Factures]
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
 *         description: Détails de la facture
 *       404:
 *         description: Facture introuvable
 */
router.get('/:id', verifierJWT, facturesController.obtenirParId);

/**
 * @openapi
 * /api/factures:
 *   post:
 *     summary: Générer une nouvelle facture
 *     tags: [Factures]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, montant, date_echeance]
 *             properties:
 *               client_id:
 *                 type: integer
 *                 example: 12
 *               montant:
 *                 type: number
 *                 example: 15000
 *               date_echeance:
 *                 type: string
 *                 format: date
 *                 example: "2026-09-01"
 *     responses:
 *       201:
 *         description: Facture créée avec succès
 */
router.post('/', verifierJWT, garderRole('admin', 'agent'), facturesController.creer);

/**
 * @openapi
 * /api/factures/{id}/payer:
 *   patch:
 *     summary: Marquer une facture comme payée
 *     tags: [Factures]
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
 *         description: Statut de la facture mis à jour à 'payee'
 */
router.patch('/:id/payer', verifierJWT, facturesController.payer);

module.exports = router;