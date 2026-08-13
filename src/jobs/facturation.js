const cron = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const facturesController = require('../controllers/facturesController');

const FUSEAU = process.env.CRON_TIMEZONE || 'Africa/Dakar';

/**
 * Envoie une notification "notification:push" en temps réel à UN client,
 * identifié par clients.id (pas utilisateurs.id).
 *
 * IMPORTANT : la room Socket.IO "user:{id}" est indexée sur utilisateurs.id
 * (voir socket/support.js), alors que clientId ici est un clients.id. Il
 * faut donc résoudre l'un vers l'autre avant d'émettre. Ne fait jamais
 * planter l'appelant : une notification manquée n'est pas une raison de
 * faire échouer toute la tâche planifiée de facturation.
 */
async function notifierClient(io, clientId, payload) {
  if (!io || !clientId) return;
  try {
    const resultat = await query('SELECT utilisateur_id FROM clients WHERE id = $1', [clientId]);
    const utilisateurId = resultat.rows[0]?.utilisateur_id;
    if (utilisateurId) {
      io.to(`user:${utilisateurId}`).emit('notification:push', payload);
    }
  } catch (err) {
    // Notification best-effort.
  }
}

/**
 * Démarre les deux tâches planifiées de facturation :
 *  1. Le 1er de chaque mois à 00h05 : génère la facture mensuelle de tous
 *     les clients actifs qui n'en ont pas encore pour la période en cours.
 *  2. Tous les jours à 01h00 : fait basculer en "en_retard" les factures
 *     "impayee" dont la date d'échéance est dépassée.
 *
 * Idempotent par construction : rejouer ces tâches (redémarrage du
 * serveur, exécution manuelle) ne crée jamais de doublon.
 *
 * @param {import('socket.io').Server} io  Nécessaire pour émettre les
 *   notifications "notification:push" (nouvelle facture / facture en retard)
 *   demandées par le sujet.
 */
function demarrerTachesFacturation(io) {
  cron.schedule('5 0 1 * *', async () => {
    try {
      const factures = await facturesController.genererFacturesMensuelles();
      logger.info(`Facturation mensuelle automatique : ${factures.length} facture(s) générée(s)`);

      factures.forEach((facture) => {
        notifierClient(io, facture.client_id, {
          type: 'facture_emise',
          titre: 'Nouvelle facture',
          message: `Votre facture ${facture.reference} de ${facture.montant_fcfa} FCFA a été émise.`,
          facture_id: facture.id,
        });
      });
    } catch (err) {
      logger.error(`Échec de la facturation mensuelle automatique : ${err.message}`);
    }
  }, { timezone: FUSEAU });

  cron.schedule('0 1 * * *', async () => {
    try {
      const factures = await facturesController.marquerFacturesEnRetard();
      if (factures.length) {
        logger.info(`${factures.length} facture(s) passée(s) en retard`);
      }

      factures.forEach((facture) => {
        notifierClient(io, facture.client_id, {
          type: 'facture_en_retard',
          titre: 'Facture en retard',
          message: `Votre facture ${facture.reference} est désormais en retard de paiement.`,
          facture_id: facture.id,
        });
      });
    } catch (err) {
      logger.error(`Échec de la mise à jour des factures en retard : ${err.message}`);
    }
  }, { timezone: FUSEAU });

  logger.info(`Tâches planifiées de facturation démarrées (fuseau : ${FUSEAU})`);
}

module.exports = { demarrerTachesFacturation };