const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT } = require('../middleware/auth');
const { upload, typeDepuisMime } = require('../middleware/upload');
const ticketsController = require('../controllers/ticketsController');

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
