const db = require('../config/db');

async function obtenirStats() {
  const resultat = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE statut = 'actif') AS clients_actifs,
      (SELECT COALESCE(SUM(f.prix_mensuel_fcfa), 0)
         FROM clients c JOIN forfaits f ON f.id = c.forfait_id
         WHERE c.statut = 'actif') AS mrr_fcfa,
      (SELECT COUNT(*) FROM factures WHERE statut IN ('impayee', 'en_retard')) AS factures_impayees,
      (SELECT COUNT(*) FROM tickets WHERE statut != 'ferme') AS tickets_ouverts
  `);
  return resultat.rows[0];
}

module.exports = { obtenirStats };