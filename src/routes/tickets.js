const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT } = require('../middleware/auth');
const { upload, typeDepuisMime } = require('../middleware/upload');
const ticketsController = require('../controllers/ticketsController');

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Liste des tickets
 *     description: Retourne les tickets filtrés selon le rôle et les critères fournis.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *           example: ouvert
 *       - in: query
 *         name: client_id
 *         schema:
 *           type: integer
 *           example: 5
 *       - in: query
 *         name: agent_id
 *         schema:
 *           type: integer
 *           example: 3
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: Liste paginée de tickets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Accès refusé
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
 *   post:
 *     tags:
 *       - Tickets
 *     summary: Création d'un nouveau ticket client
 *     description: Crée un ticket de support pour le client connecté.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sujet]
 *             properties:
 *               sujet: { type: string, example: 'Problème de facturation' }
 *               description: { type: string, example: 'Ma dernière facture est incorrecte.' }
 *     responses:
 *       201:
 *         description: Ticket créé
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
 * /api/tickets/{id}:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Détails d'un ticket
 *     description: Récupère un ticket si l'utilisateur y a accès.
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
 *       200:
 *         description: Ticket trouvé
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
 *         description: Accès refusé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Ticket introuvable
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
 * /api/tickets/{id}/assigner:
 *   patch:
 *     tags:
 *       - Tickets
 *     summary: Prise en charge d'un ticket par un agent
 *     description: Permet à un agent de s'assigner un ticket non pris en charge.
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
 *       200:
 *         description: Ticket assigné
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
 *         description: Accès refusé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Ticket introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Ticket déjà pris en charge
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
 * /api/tickets/{id}/messages:
 *   post:
 *     tags:
 *       - Tickets
 *     summary: Envoyer un message sur un ticket
 *     description: Ajoute un message texte dans l'historique du ticket.
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
 *             required: [contenu]
 *             properties:
 *               contenu: { type: string, example: "Bonjour, j'ai besoin de support." }
 *     responses:
 *       201:
 *         description: Message créé
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
 *         description: Accès refusé
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
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Historique des messages d'un ticket
 *     description: Retourne les messages du ticket si l'utilisateur y a accès.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: avant
 *         schema:
 *           type: string
 *           format: date-time
 *           example: '2026-08-01T00:00:00Z'
 *     responses:
 *       200:
 *         description: Historique de messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Accès refusé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Ticket introuvable
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
 * /api/tickets/{id}/statut:
 *   patch:
 *     tags:
 *       - Tickets
 *     summary: Changer le statut d'un ticket
 *     description: Met à jour le statut du ticket si l'utilisateur est autorisé.
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
 *             required: [statut]
 *             properties:
 *               statut:
 *                 type: string
 *                 enum: [ouvert, en_cours, ferme]
 *                 example: en_cours
 *     responses:
 *       200:
 *         description: Statut mis à jour
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
 *         description: Accès refusé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Ticket introuvable
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
 * /api/tickets/{id}/appels:
 *   get:
 *     tags:
 *       - Tickets
 *     summary: Historique des appels d'un ticket
 *     description: Retourne les enregistrements d'appel liés au ticket.
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
 *       200:
 *         description: Appels récupérés
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Accès refusé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Ticket introuvable
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
 * /api/tickets/{id}/fichier:
 *   post:
 *     tags:
 *       - Tickets
 *     summary: Partager un fichier sur un ticket
 *     description: Télécharge un fichier et l'associe comme message au ticket.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [fichier]
 *             properties:
 *               fichier:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Fichier partagé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Aucune pièce jointe reçue
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       401:
 *         description: Token manquant ou invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Accès refusé
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

// ── Middleware d'accès exclusif à un ticket ──────────────────────────────
// Charge le ticket et vérifie que req.user a le droit d'y accéder (voir les
// règles dans ticketsController.verifierAccesTicket) : un agent qui n'est ni
// l'agent assigné ni admin reçoit 403 — le ticket lui est invisible dès
// qu'un autre agent l'a pris en charge. Attache le ticket à req.ticket.
async function autoriserAccesTicket(req, res, next) {
  try {
    const { ticket, autorise } = await ticketsController.verifierAccesTicket(req.params.id, req.user);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
    if (!autorise) {
      return res.status(403).json({ message: 'Ce ticket est pris en charge par un autre agent' });
    }
    req.ticket = ticket;
    next();
  } catch (err) { next(err); }
}

// Obtenir tous les tickets
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { statut, client_id, agent_id, page, limite } = req.query;

    // Si l'utilisateur est un simple client, on le restreint à ses propres tickets
    let targetClientId = client_id;
    if (req.user.role === 'client') {
      const clientRes = await db.query('SELECT id FROM clients WHERE utilisateur_id = $1', [req.user.id]);
      targetClientId = clientRes.rows[0]?.id ?? -1; // -1 garantit une liste vide plutôt qu'une erreur si pas de fiche client
    }

    // Un agent voit désormais tous les tickets, y compris ceux déjà pris en
    // charge par un autre agent. Les tickets pris par un collègue doivent être
    // clairement marqués et rester inaccessibles pour cet agent.
    const resultat = await ticketsController.listerTickets({
      statut, clientId: targetClientId, agentId: agent_id, page, limite,
    });
    res.json(resultat);
  } catch (err) { next(err); }
});

// Ticket par ID
router.get('/:id', verifierJWT, autoriserAccesTicket, async (req, res) => {
  res.json(req.ticket);
});

// Créer un ticket (Réservé au Client)
router.post('/',
  verifierJWT,
  [
    body('sujet').notEmpty().withMessage('Le sujet est requis'),
    body('description').optional().isString()
  ],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

    try {
      const ticket = await ticketsController.creerTicket({
        clientId: req.user.id,
        sujet: req.body.sujet,
        description: req.body.description,
      });

      // Diffusé uniquement aux agents connectés (room "agents"), pas à tout le monde.
      const io = req.app.get('io');
      if (io) io.to('agents').emit('ticket:nouveau', ticket);

      res.status(201).json(ticket);
    } catch (err) { next(err); }
  }
);

// Prise en charge exclusive d'un ticket par un Agent
router.patch('/:id/assigner', verifierJWT, async (req, res, next) => {
  try {
    if (req.user.role !== 'agent' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const ticket = await ticketsController.assignerAgent(req.params.id, req.user.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

    const io = req.app.get('io');
    if (io) {
      // Notifie tout le monde dans la room du ticket (client + agent assigné)
      io.to(`ticket:${req.params.id}`).emit('ticket:mis_a_jour', ticket);
      // Retire le ticket de la file d'attente affichée aux autres agents
      io.to('agents').emit('ticket:pris', { id: ticket.id, agent_id: ticket.agent_id });
    }

    res.json(ticket);
  } catch (err) {
    if (err.statut409) return res.status(409).json({ message: err.message });
    next(err);
  }
});

// Ajouter un message — nécessite d'être autorisé sur ce ticket
router.post('/:id/messages',
  verifierJWT,
  [body('contenu').notEmpty().withMessage('Le contenu du message ne peut pas être vide')],
  (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });
    next();
  },
  autoriserAccesTicket,
  async (req, res, next) => {
    try {
      const message = await ticketsController.creerMessage({
        ticketId: req.params.id,
        expediteurId: req.user.id,
        contenu: req.body.contenu,
      });

      const io = req.app.get('io');
      if (io) io.to(`ticket:${req.params.id}`).emit('message:nouveau', message);

      res.status(201).json(message);
    } catch (err) { next(err); }
  }
);

// Changer le statut d'un ticket — nécessite d'être autorisé sur ce ticket
router.patch('/:id/statut',
  verifierJWT,
  [body('statut').isIn(['ouvert', 'en_cours', 'ferme'])],
  (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });
    next();
  },
  autoriserAccesTicket,
  async (req, res, next) => {
    try {
      const ticket = await ticketsController.changerStatutTicket(req.params.id, req.body.statut);
      if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

      const io = req.app.get('io');
      if (io) io.to(`ticket:${req.params.id}`).emit('ticket:mis_a_jour', ticket);

      res.json(ticket);
    } catch (err) { next(err); }
  }
);

// Historique des messages — nécessite d'être autorisé sur ce ticket
router.get('/:id/messages', verifierJWT, autoriserAccesTicket, async (req, res, next) => {
  try {
    const messages = await ticketsController.historiqueMessages(req.params.id, req.query.avant);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

// Historique des appels d'un ticket — nécessite d'être autorisé sur ce ticket
router.get('/:id/appels', verifierJWT, autoriserAccesTicket, async (req, res, next) => {
  try {
    const appels = await ticketsController.historiqueAppels(req.params.id);
    res.json({ data: appels });
  } catch (err) { next(err); }
});

// Partager un fichier — nécessite d'être autorisé sur ce ticket
router.post('/:id/fichier', verifierJWT, autoriserAccesTicket, upload.single('fichier'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });

    const type = typeDepuisMime(req.file.mimetype);
    const resultat = await db.query(
      `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, fichier_url, fichier_nom, fichier_taille)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.params.id, req.user.id, type,
        null,
        `/uploads/${req.file.filename}`,
        req.file.originalname,
        req.file.size,
      ]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`ticket:${req.params.id}`).emit('fichier:partager', resultat.rows[0]);
      io.to(`ticket:${req.params.id}`).emit('message:nouveau', resultat.rows[0]);
    }

    res.status(201).json(resultat.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
