const cron = require('node-cron');
const logger = require('../config/logger');
const facturesController = require('../controllers/facturesController');

const FUSEAU = process.env.CRON_TIMEZONE || 'Africa/Dakar';

/**
 * Démarre les deux tâches planifiées de facturation :
 *  1. Le 1er de chaque mois à 00h05 : génère la facture mensuelle de tous
 *     les clients actifs qui n'en ont pas encore pour la période en cours.
 *  2. Tous les jours à 01h00 : fait basculer en "en_retard" les factures
 *     "impayee" dont la date d'échéance est dépassée.
 *
 * Idempotent par construction : rejouer ces tâches (redémarrage du
 * serveur, exécution manuelle) ne crée jamais de doublon.
 */
function demarrerTachesFacturation() {
  cron.schedule('5 0 1 * *', async () => {
    try {
      const factures = await facturesController.genererFacturesMensuelles();
      logger.info(`Facturation mensuelle automatique : ${factures.length} facture(s) générée(s)`);
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
    } catch (err) {
      logger.error(`Échec de la mise à jour des factures en retard : ${err.message}`);
    }
  }, { timezone: FUSEAU });

  logger.info(`Tâches planifiées de facturation démarrées (fuseau : ${FUSEAU})`);
}

module.exports = { demarrerTachesFacturation };
