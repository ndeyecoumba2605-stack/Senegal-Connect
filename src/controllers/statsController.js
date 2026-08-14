const db = require('../config/db');

async function obtenirStats(user = {}) {
  const role = String(user.role || '').toLowerCase();

  // Statistiques globales administrateur
  if (role === 'admin') {
    const resultat = await db.query(`
      SELECT
        (
          SELECT COUNT(*)
          FROM clients
          WHERE statut = 'actif'
        ) AS clients_actifs,

        (
          SELECT COALESCE(SUM(f.montant_fcfa), 0)
          FROM factures f
          WHERE f.statut = 'payee'
            AND f.date_emission >= date_trunc('month', NOW())
            AND f.date_emission < date_trunc('month', NOW()) + INTERVAL '1 month'
        ) AS revenu_mensuel_fcfa,

        (
          SELECT COUNT(*)
          FROM factures
          WHERE statut IN ('impayee', 'en_retard')
        ) AS factures_impayees,

        (
          SELECT COUNT(*)
          FROM tickets
          WHERE statut IN ('ouvert', 'en_cours')
        ) AS tickets_ouverts,

        (
          SELECT COUNT(*)
          FROM tickets
          WHERE statut = 'ferme'
        ) AS tickets_resolus
    `);

    return resultat.rows[0];
  }

  // Statistiques spécifiques à l'agent connecté
  if (role === 'agent') {
    const resultat = await db.query(
      `
      SELECT
        (
          SELECT COUNT(*)
          FROM tickets
          WHERE agent_id = $1
            AND statut = 'ouvert'
        ) AS tickets_en_attente,

        (
          SELECT COUNT(*)
          FROM tickets
          WHERE agent_id = $1
            AND statut = 'en_cours'
        ) AS tickets_assignes,

        (
          SELECT COUNT(*)
          FROM tickets
          WHERE agent_id = $1
            AND statut = 'ferme'
        ) AS tickets_resolus,

        (
          SELECT COUNT(*)
          FROM appels
          WHERE initiateur_id = $1
            AND debut_le >= CURRENT_DATE
            AND debut_le < CURRENT_DATE + INTERVAL '1 day'
        ) AS appels_passes,

        (
          SELECT COUNT(*)
          FROM appels
          WHERE destinataire_id = $1
            AND debut_le >= CURRENT_DATE
            AND debut_le < CURRENT_DATE + INTERVAL '1 day'
        ) AS appels_recus,

        (
          SELECT COUNT(*)
          FROM appels
          WHERE (initiateur_id = $1 OR destinataire_id = $1)
            AND debut_le >= CURRENT_DATE
            AND debut_le < CURRENT_DATE + INTERVAL '1 day'
        ) AS appels_total
      `,
      [user.id]
    );

    return resultat.rows[0];
  }

  return {};
}

module.exports = {
  obtenirStats
};