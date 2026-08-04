const express = require('express');
const router = express.Router();
const clientsController = require('../controllers/clientsController');
const { verifierJWT, garderRole } = require('../middlewares/auth');

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: Obtenir la liste de tous les clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des clients récupérée avec succès
 */
router.get('/', verifierJWT, clientsController.lister);

/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     summary: Obtenir les détails d'un client par son ID
 *     tags: [Clients]
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
 *         description: Client trouvé
 *       404:
 *         description: Client introuvable
 */
router.get('/:id', verifierJWT, clientsController.obtenirParId);

/**
 * @openapi
 * /api/clients:
 *   post:
 *     summary: Créer un nouveau client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, telephone]
 *     responses:
 *       201:
 *         description: Client créé
 */
router.post('/', verifierJWT, garderRole('admin', 'agent'), clientsController.creer);

/**
 * @openapi
 * /api/clients/{id}:
 *   put:
 *     summary: Modifier les informations d'un client
 *     tags: [Clients]
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
 *         description: Client mis à jour
 */
router.put('/:id', verifierJWT, garderRole('admin', 'agent'), clientsController.modifier);

/**
 * @openapi
 * /api/clients/{id}/statut:
 *   patch:
 *     summary: Changer le statut d'un client
 *     tags: [Clients]
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
 *         description: Statut mis à jour
 */
router.patch('/:id/statut', verifierJWT, garderRole('admin', 'agent'), clientsController.changerStatut);

/**
 * @openapi
 * /api/clients/{id}:
 *   delete:
 *     summary: Supprimer un client
 *     tags: [Clients]
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
 *         description: Client supprimé
 */
router.delete('/:id', verifierJWT, garderRole('admin'), clientsController.supprimer);

module.exports = router;