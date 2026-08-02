const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../config/logger');

function escapeHtml(texte) {
  return texte.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const minuteursFrappe = new Map();

module.exports = function initSupport(io) {
  io.use((socket, next) => {
    try {
      socket.data.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.role === 'agent') socket.join('agents');
    logger.info(`Socket connecté : utilisateur ${user.id} (${user.role})`);

    socket.on('ticket:ouvrir', async ({ sujet }) => {
      try {
        const resultat = await db.query(
          `INSERT INTO tickets (client_id, sujet) VALUES ($1,$2) RETURNING *`,
          [user.id, sujet]
        );
        const ticket = resultat.rows[0];
        socket.join(`ticket:${ticket.id}`);
        io.to('agents').emit('ticket:nouveau', ticket);
      } catch (err) {
        socket.emit('erreur', { message: 'Impossible de créer le ticket' });
      }
    });

    socket.on('ticket:assigner', async ({ ticketId }) => {
      const resultat = await db.query(
        `UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2 RETURNING *`,
        [user.id, ticketId]
      );
      const ticket = resultat.rows[0];
      socket.join(`ticket:${ticketId}`);
      io.to(`user:${ticket.client_id}`).emit('ticket:pris_en_charge', ticket);
    });

    socket.on('ticket:fermer', async ({ ticketId }) => {
      const resultat = await db.query(
        `UPDATE tickets SET statut = 'ferme', ferme_le = NOW() WHERE id = $1 RETURNING *`,
        [ticketId]
      );
      const ticket = resultat.rows[0];
      io.to(`ticket:${ticketId}`).emit('ticket:ferme', ticket);
    });

    socket.on('message:envoyer', async ({ ticketId, contenu, type = 'texte' }) => {
      try {
        const contenuPropre = escapeHtml(contenu);
        const resultat = await db.query(
          `INSERT INTO messages (ticket_id, expediteur_id, type, contenu) VALUES ($1,$2,$3,$4) RETURNING *`,
          [ticketId, user.id, type, contenuPropre]
        );
        io.to(`ticket:${ticketId}`).emit('message:nouveau', resultat.rows[0]);
      } catch (err) {
        socket.emit('erreur', { message: "Échec de l'envoi du message" });
      }
    });

    socket.on('message:lu', async ({ messageId, expediteurId, ticketId }) => {
      await db.query(
        `INSERT INTO messages_statut (message_id, utilisateur_id, statut, lu_le)
         VALUES ($1,$2,'lu',NOW())
         ON CONFLICT (message_id, utilisateur_id) DO UPDATE SET statut='lu', lu_le=NOW()`,
        [messageId, user.id]
      );
      io.to(`user:${expediteurId}`).emit('message:statut', { messageId, statut: 'lu' });
    });

    socket.on('frappe', ({ ticketId, nom }) => {
      socket.to(`ticket:${ticketId}`).emit('frappe', { nom });

      const cle = `${ticketId}:${user.id}`;
      clearTimeout(minuteursFrappe.get(cle));
      const minuteur = setTimeout(() => {
        socket.to(`ticket:${ticketId}`).emit('frappe:fin', { nom });
        minuteursFrappe.delete(cle);
      }, 2500);
      minuteursFrappe.set(cle, minuteur);
    });

    socket.on('reaction:toggle', async ({ messageId, emoji, ticketId }) => {
      const existe = await db.query(
        `SELECT 1 FROM reactions WHERE message_id=$1 AND utilisateur_id=$2 AND emoji=$3`,
        [messageId, user.id, emoji]
      );
      if (existe.rows.length) {
        await db.query(
          `DELETE FROM reactions WHERE message_id=$1 AND utilisateur_id=$2 AND emoji=$3`,
          [messageId, user.id, emoji]
        );
      } else {
        await db.query(
          `INSERT INTO reactions (message_id, utilisateur_id, emoji) VALUES ($1,$2,$3)`,
          [messageId, user.id, emoji]
        );
      }
      const compteur = await db.query(
        `SELECT emoji, COUNT(*) FROM reactions WHERE message_id=$1 GROUP BY emoji`,
        [messageId]
      );
      io.to(`ticket:${ticketId}`).emit('reaction:mise_a_jour', { messageId, reactions: compteur.rows });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket déconnecté : utilisateur ${user.id}`);
    });
  });
};