const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT } = require('../middleware/auth');
const { upload, typeDepuisMime } = require('../middleware/upload');
const ticketsController = require('../controllers/ticketsController');

const router = express.Router();

// Obtenir tous les tickets
router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { statut, client_id, agent_id, page, limite } = req.query;
    
    // Si l'utilisateur est un simple client, on le restreint à ses propres tickets
    const targetClientId = req.user.role === 'client' ? req.user.id : client_id;

    const resultat = await ticketsController.listerTickets({
      statut, clientId: targetClientId, agentId: agent_id, page, limite,
    });
    res.json(resultat);
  } catch (err) { next(err); }
});

// Ticket par ID
router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const resultat = await db.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!resultat.rows[0]) return res.status(404).json({ message: 'Ticket introuvable' });
    res.json(resultat.rows[0]);
  } catch (err) { next(err); }
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

      const io = req.app.get('io');
      if (io) io.emit('ticket:nouveau', ticket);

      res.status(201).json(ticket);
    } catch (err) { next(err); }
  }
);

// Prise en charge d'un ticket par un Agent
router.patch('/:id/assigner', verifierJWT, async (req, res, next) => {
  try {
    if (req.user.role !== 'agent' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const ticket = await ticketsController.assignerAgent(req.params.id, req.user.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

    const io = req.app.get('io');
    if (io) io.to(`ticket:${req.params.id}`).emit('ticket:mis_a_jour', ticket);

    res.json(ticket);
  } catch (err) { next(err); }
});

// Ajouter un message
router.post('/:id/messages',
  verifierJWT,
  [body('contenu').notEmpty().withMessage('Le contenu du message ne peut pas être vide')],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

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

// Changer le statut d'un ticket
router.patch('/:id/statut',
  verifierJWT,
  [body('statut').isIn(['ouvert', 'en_cours', 'ferme'])],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

    try {
      const ticket = await ticketsController.changerStatutTicket(req.params.id, req.body.statut);
      if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

      const io = req.app.get('io');
      if (io) io.to(`ticket:${req.params.id}`).emit('ticket:mis_a_jour', ticket);

      res.json(ticket);
    } catch (err) { next(err); }
  }
);

// Historique des messages
router.get('/:id/messages', verifierJWT, async (req, res, next) => {
  try {
    const messages = await ticketsController.historiqueMessages(req.params.id, req.query.avant);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

// Partager un fichier
router.post('/:id/fichier', verifierJWT, upload.single('fichier'), async (req, res, next) => {
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