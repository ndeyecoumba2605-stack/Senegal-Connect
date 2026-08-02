const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { verifierJWT } = require('../middleware/auth');
const { upload, typeDepuisMime } = require('../middleware/upload');
const ticketsController = require('../controllers/ticketsController');

const router = express.Router();

router.get('/', verifierJWT, async (req, res, next) => {
  try {
    const { statut, client_id, agent_id, page, limite } = req.query;
    const resultat = await ticketsController.listerTickets({
      statut, clientId: client_id, agentId: agent_id, page, limite,
    });
    res.json(resultat);
  } catch (err) { next(err); }
});

router.get('/:id', verifierJWT, async (req, res, next) => {
  try {
    const resultat = await db.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!resultat.rows[0]) return res.status(404).json({ message: 'Ticket introuvable' });
    res.json(resultat.rows[0]);
  } catch (err) { next(err); }
});

router.post('/',
  verifierJWT,
  [body('sujet').notEmpty().withMessage('Le sujet est requis')],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

    try {
      const ticket = await ticketsController.creerTicket({
        clientId: req.user.id,
        sujet: req.body.sujet,
      });
      res.status(201).json(ticket);
    } catch (err) { next(err); }
  }
);

router.patch('/:id/statut',
  verifierJWT,
  [body('statut').isIn(['ouvert', 'en_cours', 'ferme'])],
  async (req, res, next) => {
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) return res.status(422).json({ erreurs: erreurs.array() });

    try {
      const ticket = await ticketsController.changerStatutTicket(req.params.id, req.body.statut);
      if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });
      res.json(ticket);
    } catch (err) { next(err); }
  }
);

router.get('/:id/messages', verifierJWT, async (req, res, next) => {
  try {
    const messages = await ticketsController.historiqueMessages(req.params.id, req.query.avant);
    res.json({ data: messages });
  } catch (err) { next(err); }
});

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
    io.to(`ticket:${req.params.id}`).emit('fichier:partager', resultat.rows[0]);
    io.to(`ticket:${req.params.id}`).emit('message:nouveau', resultat.rows[0]);

    res.status(201).json(resultat.rows[0]);
  } catch (err) { next(err); }
});

router.get('/:id/appels', verifierJWT, async (req, res, next) => {
  try {
    const appels = await ticketsController.historiqueAppels(req.params.id);
    res.json({ data: appels });
  } catch (err) { next(err); }
});

module.exports = router;