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
    socket.emit('erreur', { message: 'Accès refusé à ce ticket' });
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
    logger.info(`Socket connecté : utilisateur ${user.id} (${user.role})`);

    socket.on('ticket:ouvrir', async ({ sujet } = {}) => {
      try {
        if (user.role !== 'client') {
          return socket.emit('erreur', { message: 'Seul un client peut ouvrir un ticket' });
        }
        if (typeof sujet !== 'string' || !sujet.trim()) {
          return socket.emit('erreur', { message: 'Le sujet est requis' });
        }

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
          [clientId, sujet.trim()]
        );
        const ticket = resultat.rows[0];

        socket.join(`ticket:${ticket.id}`);

        // Notification temps réel à tous les agents
        io.to('agents').emit('ticket:nouveau', ticket);

        // Notification personnalisée
        io.to('agents').emit('notification:push', {
          type: 'nouveau_ticket',
          titre: 'Nouveau ticket',
          message: `Un nouveau ticket a été ouvert : ${ticket.sujet}`,
          ticketId: ticket.id,
          date: new Date().toISOString()
        });
      } catch (err) {
        socket.emit('erreur', { message: 'Impossible de créer le ticket' });
      }
    });

    socket.on('ticket:assigner', async ({ ticketId } = {}) => {
      try {
        if (user.role !== 'agent' && user.role !== 'admin') {
          return socket.emit('erreur', { message: 'Seul un agent peut prendre en charge un ticket' });
        }

        // Un agent peut prendre un ticket non assigné; un ticket déjà pris
        // reste accessible uniquement à l'agent qui le possède ou à l'admin.
        const acces = await verifierAccesSocket(socket, ticketId, { allowUnassignedAgent: true });
        if (!acces) return;
        if (acces.ticket.statut === 'ferme') {
          return socket.emit('erreur', { message: 'Un ticket fermé ne peut pas être assigné' });
        }

        // Condition atomique pour éviter qu deux agents ne prennent le même
        // ticket entre la vérification et l'UPDATE.
        const resultat = await db.query(
          `UPDATE tickets
           SET agent_id = $1, statut = 'en_cours'
           WHERE id = $2 AND (agent_id IS NULL OR agent_id = $1)
           RETURNING *`,
          [user.id, ticketId]
        );
        if (!resultat.rows[0]) {
          return socket.emit('erreur', { message: 'Ce ticket est déjà pris en charge par un autre agent' });
        }

        const ticket = resultat.rows[0];
        socket.join(`ticket:${ticketId}`);

        const clientRes = await db.query(
          `SELECT utilisateur_id FROM clients WHERE id = $1`,
          [ticket.client_id]
        );
        if (clientRes.rows.length > 0) {
          const utilisateurClientId = clientRes.rows[0].utilisateur_id;

          // Mise à jour de l'interface du client
          io.to(`user:${utilisateurClientId}`).emit(
            'ticket:pris_en_charge',
            ticket
          );

          // Notification personnalisée
          io.to(`user:${utilisateurClientId}`).emit(
            'notification:push',
            {
              type: 'ticket_pris_en_charge',
              titre: 'Ticket pris en charge',
              message: `Votre ticket "${ticket.sujet}" a été pris en charge par un agent.`,
              ticketId: ticket.id,
              date: new Date().toISOString()
            }
          );
        }

        io.to('agents').emit('ticket:pris', {
          id: ticket.id,
          agent_id: ticket.agent_id
        });
      } catch (err) {
        logger.error(`Erreur assignment ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de prendre en charge ce ticket' });
      }
    });

    // Rejoindre la room d'un ticket en lecture (client propriétaire, agent déjà 
    // assigné, ou admin) — n'attribue PAS le ticket, contrairement à 
    // "ticket:assigner". Nécessaire pour recevoir messages/appels en temps réel
    // sans que le simple fait d'ouvrir un ticket ne le vole à un autre agent.
    socket.on('ticket:rejoindre', async ({ ticketId } = {}) => {
      try {
        const acces = await verifierAccesSocket(socket, ticketId, { allowUnassignedAgent: true });
        if (!acces) return;
        socket.join(`ticket:${ticketId}`);

        // Marquer en base comme 'lu' tous les messages envoyés par l'autre
        // participant que cet utilisateur n'a pas encore marqués comme lus.
        try {
          const insertRes = await db.query(
            `INSERT INTO messages_statut (message_id, utilisateur_id, statut, lu_le)
             SELECT m.id, $1, 'lu', NOW()
             FROM messages m
             LEFT JOIN messages_statut ms ON ms.message_id = m.id AND ms.utilisateur_id = $1
             WHERE m.ticket_id = $2 AND m.expediteur_id <> $1 AND ms.message_id IS NULL
             RETURNING message_id`,
            [user.id, ticketId]
          );

          if (insertRes.rows.length) {
            // Notifier la room ticket et les expéditeurs concernés
            const ids = insertRes.rows.map(r => r.message_id);
            // Récupérer les expéditeurs pour notifier individuellement
            const expRes = await db.query(
              `SELECT id, expediteur_id FROM messages WHERE id = ANY($1::int[])`,
              [ids]
            );
            expRes.rows.forEach((row) => {
              const payload = { messageId: row.id, statut: 'lu', utilisateurId: user.id };
              io.to(`user:${row.expediteur_id}`).emit('message:statut', payload);
            });
            // Notifier aussi la room du ticket (pour mettre à jour la vue de tous)
            ids.forEach((mid) => io.to(`ticket:${ticketId}`).emit('message:statut', { messageId: mid, statut: 'lu', utilisateurId: user.id }));
          }
        } catch (innerErr) {
          logger.error(`Erreur marquage automatique lu pour ticket ${ticketId}: ${innerErr.message}`);
        }
      } catch (err) {
        logger.error(`Erreur accès room ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de rejoindre ce ticket' });
      }
    });

    socket.on('ticket:fermer', async ({ ticketId } = {}) => {
      try {
        if (user.role !== 'agent' && user.role !== 'admin') {
          return socket.emit('erreur', { message: "Seul l'agent assigné ou un admin peut fermer le ticket" });
        }
        const acces = await verifierAccesSocket(socket, ticketId);
        if (!acces) return;
        if (acces.ticket.statut !== 'en_cours') {
          return socket.emit('erreur', { message: 'Seul un ticket en cours peut être fermé' });
        }

        const resultat = await db.query(
          `UPDATE tickets
           SET statut = 'ferme', ferme_le = NOW()
           WHERE id = $1 AND statut = 'en_cours'
           RETURNING *`,
          [ticketId]
        );
        if (!resultat.rows[0]) {
          return socket.emit('erreur', { message: 'Le ticket ne peut plus être fermé' });
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
          return socket.emit('erreur', { message: 'Ce ticket est fermé' });
        }
        if (type !== 'texte' || typeof contenu !== 'string' || !contenu.trim()) {
          return socket.emit('erreur', { message: 'Message texte invalide' });
        }

        const contenuPropre = escapeHtml(contenu.trim());

        const resultat = await db.query(
          `INSERT INTO messages (ticket_id, expediteur_id, type, contenu)
          VALUES ($1,$2,'texte',$3)
          RETURNING *`,
          [ticketId, user.id, contenuPropre]
        );

        const message = resultat.rows[0];

        // Diffusion normale du message dans le ticket
        io.to(`ticket:${ticketId}`).emit(
          'message:nouveau',
          message
        );

        // Récupérer l'utilisateur propriétaire du ticket
        const clientRes = await db.query(
          `SELECT c.utilisateur_id
          FROM tickets t
          JOIN clients c ON c.id = t.client_id
          WHERE t.id = $1`,
          [ticketId]
        );

        if (clientRes.rows.length > 0) {
          const clientUtilisateurId = clientRes.rows[0].utilisateur_id;

          // Ne pas notifier l'expéditeur lui-même
          if (String(clientUtilisateurId) !== String(user.id)) {
            io.to(`user:${clientUtilisateurId}`).emit(
              'notification:push',
              {
                type: 'ticket_repondu',
                titre: 'Réponse à votre ticket',
                message: 'Un agent a répondu à votre ticket.',
                ticketId,
                messageId: message.id,
                date: new Date().toISOString()
              }
            );
          }
        }
      } catch (err) {
        logger.error(`Erreur message ticket ${ticketId}: ${err.message}`);
        socket.emit('erreur', { message: "Échec de l'envoi du message" });
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
        const payload = { messageId, statut: 'lu', utilisateurId: user.id };
        io.to(`user:${messageRes.rows[0].expediteur_id}`).emit('message:statut', payload);
        io.to(`ticket:${ticketId}`).emit('message:statut', payload);
      } catch (err) {
        logger.error(`Erreur accusé message ${messageId}: ${err.message}`);
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
          return socket.emit('erreur', { message: 'Ce ticket est fermé' });
        }
        if (!messageId || typeof emoji !== 'string' || !emoji.trim() || [...emoji].length > 10) {
          return socket.emit('erreur', { message: 'Réaction invalide' });
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
        logger.error(`Erreur réaction message ${messageId}: ${err.message}`);
        socket.emit('erreur', { message: 'Impossible de modifier la réaction' });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket déconnecté : utilisateur ${user.id}`);
    });
  });
};