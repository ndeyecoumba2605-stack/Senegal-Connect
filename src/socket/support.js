const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('../config/logger');
const ticketsController = require('../controllers/ticketsController');

function escapeHtml(texte) {
  return texte.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const minuteursFrappe = new Map();

async function verifierAccesSocket(socket, ticketId, options = {}) {
  if (!ticketId) {
    socket.emit('erreur', { message: 'Ticket requis' });
    return null;
  }

  const acces = await ticketsController.verifierAccesTicket(ticketId, socket.data.user, options);
  if (!acces.ticket) {
    socket.emit('erreur', { message: 'Ticket introuvable' });
    return null;
  }
  if (!acces.autorise) {
    socket.emit('erreur', { message: 'AccÃ¨s refusÃ© Ã  ce ticket' });
    return null;
  }
  return acces;
}

function statutTicketFerme(acces) {
  if (acces?.ticket?.statut === 'ferme') {
    return true;
  }
  return false;
}

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
    logger.info(`Socket connectÃ© : utilisateur ${user.id} (${user.role})`);

    socket.on('ticket:ouvrir', async ({ sujet } = {}) => {
      try {
        if (user.role !== 'client') {
          return socket.emit('erreur', { message: 'Seul un client peut ouvrir un ticket' });
        }
        if (typeof sujet !== 'string' || !sujet.trim()) {
          return socket.emit('erreur', { message: 'Le sujet est requis' });
        }

        // tickets.client_id rÃ©fÃ©rence clients(id), pas utilisateurs(id) :
        // on doit d'abord retrouver le client liÃ© Ã  l'utilisateur connectÃ©.
        const clientRes = await db.query(
          `SELECT id FROM clients WHERE utilisateur_id = $1`,
          [user.id]
        );
        if (clientRes.rows.length === 0) {
          return socket.emit('erreur', { message: "Aucun profil client associÃ© Ã  cet utilisateur" });
        }
        const clientId = clientRes.rows[0].id;

        const resultat = await db.query(
          `INSERT INTO tickets (client_id, sujet) VALUES ($1,$2) RETURNING *`,
          [clientId, sujet.trim()]
        );
        const ticket = resultat.rows[0];
        socket.join(`ticket:${ticket.id}`);
        io.to('agents').emit('ticket:nouveau', ticket);
      } catch (err) {
        socket.emit('erreur', { message: 'Impossible de crÃ©er le ticket' });
      }
    });

    socket.on('ticket:assigner', async ({ ticketId } = {}) => {
      try {
        if (user.role !== 'agent' && user.role !== 'admin') {
          return socket.emit('erreur', { message: 'Seul un agent peut prendre en charge un ticket' });
        }

        // Un agent peut prendre un ticket non assignÃ©; un ticket dÃ©jÃ  pris
        // reste accessible uniquement Ã  l'agent qui le possÃ¨de ou Ã  l'admin.
        const acces = await verifierAccesSocket(socket, ticketId, { allowUnassignedAgent: true });
        if (!acces) return;
        if (acces.ticket.statut === 'ferme') {
          return socket.emit('erreur', { message: 'Un ticket fermÃ© ne peut pas Ãªtre assignÃ©' });
        }

        // Condition atomique pour Ã©viter qu deux agents ne prennent le mÃªme
        // ticket entre la vÃ©rification et l'UPDATE.
        const resultat = await db.query(
          `UPDATE tickets
           SET agent_id = $1, statut = 'en_cours'
           WHERE id = $2 AND (agent_id IS NULL OR agent_id = $1)
           RETURNING *`,
          [user.id, ticketId]
        );
        if (!resultat.rows[0]) {
          return socket.emit('erreur', { message: 'Ce ticket est dÃ©jÃ  pris en charge par un autre agent' });
        }

        const ticket = resultat.rows[0];
        socket.join(`ticket:${ticketId}`);

        const clientRes = await db.query(
          `SELECT utilisateur_id FROM clients WHERE id = $1`,
          [ticket.client_id]
        );
        if (clientRes.rows.length > 0) {
          io.to(`user:${clientRes.rows[0].utilisateur_id}`).emit('ticket:pris_en_charge', ticket);
        }

        io.to('agents').emit('ticket:pris', { id: ticket.id, agent_id: ticket.agent_id });
      } catch (err) {
        logger.error(`Erreur assignment ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de prendre en charge ce ticket' });
      }
    });

    // Rejoindre la room d'un ticket en lecture (client propriÃ©taire, agent dÃ©jÃ 
    // assignÃ©, ou admin) â€” n'attribue PAS le ticket, contrairement Ã 
    // "ticket:assigner". NÃ©cessaire pour recevoir messages/appels en temps rÃ©el
    // sans que le simple fait d'ouvrir un ticket ne le vole Ã  un autre agent.
    socket.on('ticket:rejoindre', async ({ ticketId } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId, { allowUnassignedAgent: true });
        if (!acces) return;
        socket.join(`ticket:${ticketId}`);
      } catch (err) {
        logger.error(`Erreur accÃ¨s room ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de rejoindre ce ticket' });
      }
    });

    socket.on('ticket:fermer', async ({ ticketId } = {}) => {
      try {
        if (user.role !== 'agent' && user.role !== 'admin') {
          return socket.emit('erreur', { message: 'Seul lâ€™agent assignÃ© ou un admin peut fermer le ticket' });
        }
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces) return;
        if (acces.ticket.statut !== 'en_cours') {
          return socket.emit('erreur', { message: 'Seul un ticket en cours peut Ãªtre fermÃ©' });
        }

        const resultat = await db.query(
          `UPDATE tickets
           SET statut = 'ferme', ferme_le = NOW()
           WHERE id = $1 AND statut = 'en_cours'
           RETURNING *`,
          [ticketId]
        );
        if (!resultat.rows[0]) {
          return socket.emit('erreur', { message: 'Le ticket ne peut plus Ãªtre fermÃ©' });
        }
        io.to(`ticket:${ticketId}`).emit('ticket:ferme', resultat.rows[0]);
      } catch (err) {
        logger.error(`Erreur fermeture ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de fermer ce ticket' });
      }
    });

    socket.on('message:envoyer', async ({ ticketId, contenu, type = 'texte' } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces) return;
        if (statutTicketFerme(acces)) {
          return socket.emit('erreur', { message: 'Ce ticket est fermÃ©' });
        }
        if (type !== 'texte' || typeof contenu !== 'string' || !contenu.trim()) {
          return socket.emit('erreur', { message: 'Message texte invalide' });
        }

        const contenuPropre = escapeHtml(contenu.trim());
        const resultat = await db.query(
          `INSERT INTO messages (ticket_id, expediteur_id, type, contenu)
           VALUES ($1,$2,'texte',$3) RETURNING *`,
          [ticketId, user.id, contenuPropre]
        );
        io.to(`ticket:${ticketId}`).emit('message:nouveau', resultat.rows[0]);
      } catch (err) {
        logger.error(`Erreur message ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: "Ã‰chec de l'envoi du message" });
      }
    });

    socket.on('message:lu', async ({ messageId, ticketId } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces) return;
        if (!messageId) return socket.emit('erreur', { message: 'Message requis' });

        const messageRes = await db.query(
          `SELECT expediteur_id FROM messages WHERE id = $1 AND ticket_id = $2`,
          [messageId, ticketId]
        );
        if (!messageRes.rows[0]) {
          return socket.emit('erreur', { message: 'Message introuvable dans ce ticket' });
        }

        await db.query(
          `INSERT INTO messages_statut (message_id, utilisateur_id, statut, lu_le)
           VALUES ($1,$2,'lu',NOW())
           ON CONFLICT (message_id, utilisateur_id)
           DO UPDATE SET statut='lu', lu_le=NOW()`,
          [messageId, user.id]
        );
        io.to(`user:${messageRes.rows[0].expediteur_id}`).emit('message:statut', {
          messageId,
          statut: 'lu',
        });
      } catch (err) {
        logger.error(`Erreur accusÃ© message ${messageId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de marquer le message comme lu' });
      }
    });

    socket.on('frappe', async ({ ticketId } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces || statutTicketFerme(acces)) return;

        const nom = user.prenom || user.nom || 'Utilisateur';
        socket.to(`ticket:${ticketId}`).emit('frappe', { nom });

        const cle = `${ticketId}:${user.id}`;
        clearTimeout(minuteursFrappe.get(cle));
        const minuteur = setTimeout(() => {
          socket.to(`ticket:${ticketId}`).emit('frappe:fin', { nom });
          minuteursFrappe.delete(cle);
        }, 2500);
        minuteursFrappe.set(cle, minuteur);
      } catch (err) {
        logger.error(`Erreur indicateur de frappe ${ticketId}: ${err.message}`);
      }
    });

    socket.on('reaction:toggle', async ({ messageId, emoji, ticketId } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces) return;
        if (statutTicketFerme(acces)) {
          return socket.emit('erreur', { message: 'Ce ticket est fermÃ©' });
        }
        if (!messageId || typeof emoji !== 'string' || !emoji.trim() || [...emoji].length > 10) {
          return socket.emit('erreur', { message: 'RÃ©action invalide' });
        }

        const messageRes = await db.query(
          `SELECT id FROM messages WHERE id = $1 AND ticket_id = $2`,
          [messageId, ticketId]
        );
        if (!messageRes.rows[0]) {
          return socket.emit('erreur', { message: 'Message introuvable dans ce ticket' });
        }

        const reaction = emoji.trim();
        const existe = await db.query(
          `SELECT 1 FROM reactions WHERE message_id=$1 AND utilisateur_id=$2 AND emoji=$3`,
          [messageId, user.id, reaction]
        );
        if (existe.rows.length) {
          await db.query(
            `DELETE FROM reactions WHERE message_id=$1 AND utilisateur_id=$2 AND emoji=$3`,
            [messageId, user.id, reaction]
          );
        } else {
          await db.query(
            `INSERT INTO reactions (message_id, utilisateur_id, emoji) VALUES ($1,$2,$3)`,
            [messageId, user.id, reaction]
          );
        }

        const compteur = await db.query(
          `SELECT emoji, COUNT(*)::int AS count
           FROM reactions WHERE message_id=$1 GROUP BY emoji`,
          [messageId]
        );
        io.to(`ticket:${ticketId}`).emit('reaction:mise_a_jour', {
          messageId,
          reactions: compteur.rows,
        });
      } catch (err) {
        logger.error(`Erreur rÃ©action message ${messageId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de modifier la rÃ©action' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket dÃ©connectÃ© : utilisateur ${user.id}`);
    });
  });
};