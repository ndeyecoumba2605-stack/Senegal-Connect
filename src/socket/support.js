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
      if (socket.data.user && socket.data.user.role) {
        socket.data.user.role = String(socket.data.user.role).toLowerCase();
      }
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
        // tickets.client_id référence clients(id), pas utilisateurs(id) :
        // on doit d'abord retrouver le client lié à l'utilisateur connecté.
        const clientRes = await db.query(
          `SELECT id FROM clients WHERE utilisateur_id = $1`,
          [user.id]
        );
        if (clientRes.rows.length === 0) {
          return socket.emit('erreur', { message: "Aucun profil client associé à cet utilisateur" });
        }
        const clientId = clientRes.rows[0].id;

        const resultat = await db.query(
          `INSERT INTO tickets (client_id, sujet) VALUES ($1,$2) RETURNING *`,
          [clientId, sujet]
        );
        const ticket = resultat.rows[0];
        socket.join(`ticket:${ticket.id}`);
        io.to('agents').emit('ticket:nouveau', ticket);
      } catch (err) {
        socket.emit('erreur', { message: 'Impossible de créer le ticket' });
      }
    });

    socket.on('ticket:assigner', async ({ ticketId }) => {
      // Seuls agent/admin peuvent prendre en charge un ticket.
      if (user.role !== 'agent' && user.role !== 'admin') {
        return socket.emit('erreur', { message: 'Seul un agent peut prendre en charge un ticket' });
      }

      // Exclusivité : un ticket déjà pris par un AUTRE agent ne peut pas être volé.
      const existant = await db.query(`SELECT agent_id FROM tickets WHERE id = $1`, [ticketId]);
      if (existant.rows.length === 0) {
        return socket.emit('erreur', { message: 'Ticket introuvable' });
      }
      if (existant.rows[0].agent_id && existant.rows[0].agent_id !== user.id) {
        return socket.emit('erreur', { message: 'Ce ticket est déjà pris en charge par un autre agent' });
      }

      const resultat = await db.query(
        `UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2 RETURNING *`,
        [user.id, ticketId]
      );
      const ticket = resultat.rows[0];
      socket.join(`ticket:${ticketId}`);

      // ticket.client_id est l'id de la table clients : on retrouve l'utilisateur_id
      // correspondant pour notifier la bonne room "user:{id}".
      const clientRes = await db.query(
        `SELECT utilisateur_id FROM clients WHERE id = $1`,
        [ticket.client_id]
      );
      if (clientRes.rows.length > 0) {
        io.to(`user:${clientRes.rows[0].utilisateur_id}`).emit('ticket:pris_en_charge', ticket);
      }

      // Retire le ticket de la file d'attente affichée aux autres agents.
      io.to('agents').emit('ticket:pris', { id: ticket.id, agent_id: ticket.agent_id });
    });

    // Rejoindre la room d'un ticket en lecture (client propriétaire, agent déjà
    // assigné, ou admin) — n'attribue PAS le ticket, contrairement à
    // "ticket:assigner". Nécessaire pour recevoir messages/appels en temps réel
    // sans que le simple fait d'ouvrir un ticket ne le vole à un autre agent.
    socket.on('ticket:rejoindre', async ({ ticketId }) => {
      const resultat = await db.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
      const ticket = resultat.rows[0];
      if (!ticket) return socket.emit('erreur', { message: 'Ticket introuvable' });

      const role = String(user.role || '').toLowerCase();
      let autorise = role === 'admin';
      if (role === 'agent') {
        autorise = !ticket.agent_id || ticket.agent_id === user.id;
      } else if (role === 'client') {
        const clientRes = await db.query(`SELECT id FROM clients WHERE utilisateur_id = $1`, [user.id]);
        autorise = clientRes.rows[0]?.id === ticket.client_id;
      }

      if (!autorise) {
        return socket.emit('erreur', { message: 'Ce ticket est pris en charge par un autre agent' });
      }
      socket.join(`ticket:${ticketId}`);
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