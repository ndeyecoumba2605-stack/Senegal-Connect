const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { verifierJWT, garderRole } = require('../middleware/auth');
const { query } = require('../config/db');
const facturesController = require('../controllers/facturesController');

const router = express.Router();

router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { client_id, statut, periode, page, limite } = req.query;
    let clientId = client_id;

    // Un client ne peut voir que SES PROPRES factures, quel que soit le
    // ?client_id= demandé. req.user.id est l'id de la table utilisateurs :
    // on doit résoudre le clients.id correspondant (même piège que pour les
    // tickets, où client_id référence clients(id), pas utilisateurs(id)).
    if (req.user.role === 'client') {
      const clientRes = await query('SELECT id FROM clients WHERE utilisateur_id = $1', [req.user.id]);
      clientId = clientRes.rows[0]?.id ?? -1; // -1 : aucun résultat, garantit une liste vide
    }

    const resultat = await facturesController.lister({ clientId, statut, periode, page, limite });
    res.json(resultat);
  } catch (err) { next(err); }
});

router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const facture = await facturesController.detail(req.params.id);
    if (!facture) return res.status(404).json({ message: 'Facture introuvable' });

    // Un client ne peut consulter que ses propres factures.
    if (req.user.role === 'client') {
      const clientRes = await query('SELECT id FROM clients WHERE utilisateur_id = $1', [req.user.id]);
      const monClientId = clientRes.rows[0]?.id;
      if (monClientId !== facture.client_id) {
        return res.status(403).json({ message: 'Accès refusé à cette facture' });
      }
    }

    res.json(facture);
  } catch (err) { next(err); }
});

router.post('/',
  verifierJWT, garderRole('admin'),
  [
    body('client_id').isInt(),
    body('periode').matches(/^\d{4}-\d{2}$/).withMessage('Format attendu : YYYY-MM'),
    body('montant_fcfa').isInt({ min: 0 }),
  ],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(422).json({ erreurs: erreurs.array().map(e => ({ champ: e.path, message: e.msg, valeur: e.value })) });
    }
    try {
      const facture = await facturesController.creer(req.body);
      res.status(201).json(facture);
    } catch (err) { next(err); }
  }
);

/**
 * @openapi
 * /api/factures/{id}:
 *   delete:
 *     summary: Supprimer une facture
 *     description: Suppression réservée à un administrateur.
 *     tags: [Factures]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         example: 42
 *     responses:
 *       204: { description: Facture supprimée }
 *       401: { description: Token manquant ou invalide }
 *       403: { description: Rôle insuffisant }
 *       404: { description: Facture introuvable }
 *       422: { description: ID invalide }
 */
router.delete('/:id',
  verifierJWT,
  garderRole('admin'),
  param('id').isInt({ min: 1 }).withMessage('ID de facture invalide'),
  (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(422).json({
        erreurs: erreurs.array().map((e) => ({ champ: e.path, message: e.msg, valeur: e.value })),
      });
    }
    next();
  },
  async (req, res, next) => {
    try {
      const supprimee = await facturesController.supprimer(req.params.id);
      if (!supprimee) return res.status(404).json({ message: 'Facture introuvable' });
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

router.put('/:id/statut',
  verifierJWT, garderRole('admin'),
  [body('statut').isIn(['payee', 'impayee', 'en_retard'])],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });
    try {
      const facture = await facturesController.changerStatut(req.params.id, req.body.statut);
      if (!facture) return res.status(404).json({ message: 'Facture introuvable' });
      res.json(facture);
    } catch (err) { next(err); }
  }
);

/**
 * @openapi
 * /api/factures/generer-mensuelles:
 *   post:
 *     summary: Déclenche manuellement la facturation mensuelle (admin)
 *     description: >
 *       Génère la facture du mois pour tous les clients actifs qui n'en ont
 *       pas déjà une sur la période demandée. Idempotent — rejouer cette
 *       route ne crée jamais de doublon. Exécutée automatiquement chaque
 *       1er du mois ; cette route sert aux tests manuels et à la démo.
 *     tags: [Factures]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               periode:
 *                 type: string
 *                 example: '2026-08'
 *                 description: Format YYYY-MM. Par défaut, le mois en cours.
 *     responses:
 *       201:
 *         description: Factures générées
 */
router.post('/generer-mensuelles', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    const factures = await facturesController.genererFacturesMensuelles(req.body?.periode);
    res.status(201).json({ genere: factures.length, factures });
  } catch (err) { next(err); }
});

module.exports = router;