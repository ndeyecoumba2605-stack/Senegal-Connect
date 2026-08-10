const db = require('../config/db');

async function obtenirStats() {
  const resultat = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE statut = 'actif') AS clients_actifs,
      (SELECT COALESCE(SUM(f.montant_fcfa), 0)
         FROM factures f
         WHERE f.statut = 'payee'
           AND f.date_emission >= date_trunc('month', NOW())
           AND f.date_emission < date_trunc('month', NOW()) + INTERVAL '1 month') AS revenu_mensuel_fcfa,
      (SELECT COUNT(*) FROM factures WHERE statut IN ('impayee', 'en_retard')) AS factures_impayees,
      (SELECT COUNT(*) FROM tickets WHERE statut != 'ferme') AS tickets_ouverts
  `);
  return resultat.rows[0];
}

module.exports = { obtenirStats };