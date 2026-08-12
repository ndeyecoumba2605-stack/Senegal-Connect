const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifierJWT, garderRole } = require('../middleware/auth');
const forfaitsController = require('../controllers/forfaitsController');

/**
 * @openapi
 * /api/forfaits:
 *   get:
 *     tags:
 *       - Forfaits
 *     summary: Liste de tous les forfaits
 *     description: Retourne la liste des forfaits disponibles.
 *     responses:
 *       200:
 *         description: Liste de forfaits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Forfait'
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *
 *   post:
 *     tags:
 *       - Forfaits
 *     summary: Création d'un nouveau forfait
 *     description: Ajoute un forfait réservé aux administrateurs.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa]
 *             properties:
 *               nom: { type: string, example: 'Forfait Confort' }
 *               quota_data_go: { type: integer, example: 10 }
 *               quota_voix_min: { type: integer, example: 300 }
 *               prix_mensuel_fcfa: { type: integer, example: 5000 }
 *     responses:
 *       201:
 *         description: Forfait créé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forfait'
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
 * /api/forfaits/{id}:
 *   get:
 *     tags:
 *       - Forfaits
 *     summary: Détail d'un forfait
 *     description: Récupère les informations d'un forfait par son identifiant.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Forfait trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forfait'
 *       404:
 *         description: Forfait introuvable
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
 *   put:
 *     tags:
 *       - Forfaits
 *     summary: Mise à jour d'un forfait
 *     description: Modifie un forfait existant.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa]
 *             properties:
 *               nom: { type: string, example: 'Forfait Confort+' }
 *               quota_data_go: { type: integer, example: 15 }
 *               quota_voix_min: { type: integer, example: 400 }
 *               prix_mensuel_fcfa: { type: integer, example: 7000 }
 *     responses:
 *       200:
 *         description: Forfait mis à jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forfait'
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
 *       404:
 *         description: Forfait introuvable
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
 *   delete:
 *     tags:
 *       - Forfaits
 *     summary: Suppression d'un forfait
 *     description: Supprime un forfait existant.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       204:
 *         description: Forfait supprimé
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
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
const router = express.Router();

const validerForfait = [
  body('nom').notEmpty(),
  body('quota_data_go').isInt({ min: 0 }),
  body('quota_voix_min').isInt({ min: 0 }),
  body('prix_mensuel_fcfa').isInt({ min: 1 }).withMessage('Le prix doit être supérieur à 0'),
];

router.get('/', async (req, res, next) => {
  try {
    const forfaits = await forfaitsController.lister();
    res.json({ data: forfaits });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const forfait = await forfaitsController.detail(req.params.id, req.query.page, req.query.limite);
    if (!forfait) return res.status(404).json({ message: 'Forfait introuvable' });
    res.json(forfait);
  } catch (err) { next(err); }
});

router.post('/', verifierJWT, garderRole('admin'), validerForfait, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const forfait = await forfaitsController.creer(req.body);
    res.status(201).json(forfait);
  } catch (err) { next(err); }
});

router.put('/:id', verifierJWT, garderRole('admin'), validerForfait, async (req, res, next) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
  }
  try {
    const forfait = await forfaitsController.modifier(req.params.id, req.body);
    if (!forfait) return res.status(404).json({ message: 'Forfait introuvable' });
    res.json(forfait);
  } catch (err) { next(err); }
});

router.delete('/:id', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    await forfaitsController.supprimer(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.statut409) return res.status(409).json({ message: err.message });
    next(err);
  }
});

module.exports = router;