const db = require('../config/db');

module.exports = function initAppels(io) {
  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('appel:initier', async ({ ticketId, destinataireId, type, peerId }) => {
      try {
        const resultat = await db.query(
          `INSERT INTO appels (ticket_id, initiateur_id, destinataire_id, type, statut)
           VALUES ($1,$2,$3,$4,'initie') RETURNING *`,
          [ticketId, user.id, destinataireId, type]
        );
        const appel = resultat.rows[0];

        io.to(`user:${destinataireId}`).emit('appel:entrant', {
          appelId: appel.id,
          initiateur: { id: user.id, nom: user.nom },
          peerIdInitiateur: peerId,
          type,
        });
      } catch (err) {
        socket.emit('erreur', { message: "Impossible d'initier l'appel" });
      }
    });

    socket.on('appel:accepter', async ({ appelId, initiateurId, peerId }) => {
      await db.query(`UPDATE appels SET statut = 'accepte' WHERE id = $1`, [appelId]);
      io.to(`user:${initiateurId}`).emit('appel:accepte', { appelId, peerId });
    });

    socket.on('appel:refuser', async ({ appelId, initiateurId }) => {
      await db.query(
        `UPDATE appels SET statut = 'refuse', fin_le = NOW() WHERE id = $1`,
        [appelId]
      );
      io.to(`user:${initiateurId}`).emit('appel:refuse', { appelId });
    });

    socket.on('appel:terminer', async ({ appelId, dureeSecondes, autrePartieId }) => {
      await db.query(
        `UPDATE appels SET statut = 'termine', duree_secondes = $1, fin_le = NOW() WHERE id = $2`,
        [dureeSecondes, appelId]
      );
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