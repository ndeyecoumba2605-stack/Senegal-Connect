const db = require('../config/db');

module.exports = function initAppels(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    // Assurer que chaque socket rejoint sa room utilisateur et, si agent, la room agents
    if (user && user.id) {
      socket.join(`user:${user.id}`);
      if (String(user.role || '').toLowerCase() === 'agent') socket.join('agents');
    }

    socket.on('appel:initier', async ({ ticketId, destinataireId, type, peerId }) => {
      try {
        // Vérifier que le ticket existe, est en statut 'en_cours' et que
        // l'appelant fait partie des participants (client ou agent assigné).
        const ticketRes = await db.query(
          `SELECT t.id, t.statut, t.agent_id, c.utilisateur_id AS client_utilisateur_id
           FROM tickets t JOIN clients c ON t.client_id = c.id WHERE t.id = $1`,
          [ticketId]
        );
        const ticket = ticketRes.rows[0];
        if (!ticket) return socket.emit('erreur', { message: 'Ticket introuvable' });
        if (ticket.statut !== 'en_cours') return socket.emit('erreur', { message: 'L\'appel n\'est possible que si le ticket est en statut "en_cours"' });

        const role = String(user.role || '').toLowerCase();
        const estClient = role === 'client' && String(user.id) === String(ticket.client_utilisateur_id);
        const estAgent = role === 'agent' && String(user.id) === String(ticket.agent_id);
        if (!estClient && !estAgent) return socket.emit('erreur', { message: 'Vous n\'êtes pas autorisé à initier un appel sur ce ticket' });

        // Vérifier que le destinataire correspond bien à l'autre partie attendue
        if (estClient && String(destinataireId) !== String(ticket.agent_id)) {
          return socket.emit('erreur', { message: 'Aucun agent assigné correspondant au destinataire' });
        }
        if (estAgent && String(destinataireId) !== String(ticket.client_utilisateur_id)) {
          return socket.emit('erreur', { message: 'Destinataire invalide pour cet appel' });
        }

        // statut initial doit respecter la contrainte CHECK de schema.sql : 'sonnerie'
        const resultat = await db.query(
          `INSERT INTO appels (ticket_id, initiateur_id, destinataire_id, type, statut)
           VALUES ($1,$2,$3,$4,'sonnerie') RETURNING *`,
          [ticketId, user.id, destinataireId, type]
        );
        const appel = resultat.rows[0];

        io.to(`user:${destinataireId}`).emit('appel:entrant', {
          appelId: appel.id,
          ticketId,
          initiateur: { id: user.id, nom: user.nom },
          peerIdInitiateur: peerId,
          type,
        });
      } catch (err) {
        socket.emit('erreur', { message: "Impossible d'initier l'appel" });
      }
    });

    socket.on('appel:accepter', async ({ appelId, initiateurId, peerId }) => {
      // Seul le destinataire peut accepter ; vérifier que l'appel existe et
      // que l'utilisateur est bien destinataire.
      const aRes = await db.query(`SELECT destinataire_id, ticket_id FROM appels WHERE id = $1`, [appelId]);
      const a = aRes.rows[0];
      if (!a) return socket.emit('erreur', { message: 'Appel introuvable' });
      if (String(a.destinataire_id) !== String(user.id)) return socket.emit('erreur', { message: 'Vous n\'êtes pas destinataire de cet appel' });

      await db.query(`UPDATE appels SET statut = 'accepte' WHERE id = $1`, [appelId]);
      io.to(`user:${initiateurId}`).emit('appel:accepte', { appelId, peerId, ticketId: a.ticket_id });
    });

    socket.on('appel:refuser', async ({ appelId, initiateurId }) => {
      const aRes = await db.query(`SELECT destinataire_id, ticket_id FROM appels WHERE id = $1`, [appelId]);
      const a = aRes.rows[0];
      if (!a) return socket.emit('erreur', { message: 'Appel introuvable' });
      if (String(a.destinataire_id) !== String(user.id)) return socket.emit('erreur', { message: 'Vous n\'êtes pas destinataire de cet appel' });

      await db.query(
        `UPDATE appels SET statut = 'refuse', fin_le = NOW() WHERE id = $1`,
        [appelId]
      );
      io.to(`user:${initiateurId}`).emit('appel:refuse', { appelId, ticketId: a.ticket_id });
    });

    socket.on('appel:reaction', ({ appelId, emoji, autrePartieId }) => {
      if (autrePartieId) {
        io.to(`user:${autrePartieId}`).emit('appel:reaction', {
          appelId,
          emoji,
          de: { id: user.id, nom: user.nom },
        });
      }
    });

    socket.on('appel:terminer', async ({ appelId, dureeSecondes, autrePartieId, ticketId }) => {
      await db.query(
        `UPDATE appels SET statut = 'termine', duree_secondes = $1, fin_le = NOW() WHERE id = $2`,
        [dureeSecondes, appelId]
      );

      if (ticketId) {
        io.to(`ticket:${ticketId}`).emit('appel:termine', { appelId, dureeSecondes });
      }

      if (autrePartieId) {
        io.to(`user:${autrePartieId}`).emit('appel:termine', { appelId, dureeSecondes });
      }
    });

    socket.on('appel:controle', ({ ticketId, micro, video, partageEcran }) => {
      socket.to(`ticket:${ticketId}`).emit('appel:controle', {
        de: user.id, micro, video, partageEcran,
      });
    });
  });
};