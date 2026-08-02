const db = require('../config/db');

async function lister() {
  const resultat = await db.query(`
    SELECT f.*, COUNT(c.id) FILTER (WHERE c.statut = 'actif') AS nb_clients
    FROM forfaits f
    LEFT JOIN clients c ON c.forfait_id = f.id
    WHERE f.actif = true
    GROUP BY f.id
    ORDER BY f.id
  `);
  return resultat.rows;
}

async function detail(id, page = 1, limite = 20) {
  const forfait = await db.query('SELECT * FROM forfaits WHERE id = $1', [id]);
  if (!forfait.rows[0]) return null;

  const offset = (page - 1) * limite;
  const clients = await db.query(
    `SELECT * FROM clients WHERE forfait_id = $1 ORDER BY id LIMIT $2 OFFSET $3`,
    [id, limite, offset]
  );
  const total = await db.query(`SELECT COUNT(*) FROM clients WHERE forfait_id = $1`, [id]);

  return {
    ...forfait.rows[0],
    clients: {
      data: clients.rows,
      pagination: {
        total: parseInt(total.rows[0].count),
        page: Number(page),
        limite: Number(limite),
        total_pages: Math.ceil(total.rows[0].count / limite),
      },
    },
  };
}

async function creer({ nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa }) {
  const resultat = await db.query(
    `INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa) VALUES ($1,$2,$3,$4) RETURNING *`,
    [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa]
  );
  return resultat.rows[0];
}

async function modifier(id, { nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa }) {
  const resultat = await db.query(
    `UPDATE forfaits SET nom=$1, quota_data_go=$2, quota_voix_min=$3, prix_mensuel_fcfa=$4 WHERE id=$5 RETURNING *`,
    [nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, id]
  );
  return resultat.rows[0];
}

async function supprimer(id) {
  const abonnes = await db.query(
    `SELECT COUNT(*) FROM clients WHERE forfait_id = $1 AND statut = 'actif'`,
    [id]
  );
  if (parseInt(abonnes.rows[0].count) > 0) {
    const erreur = new Error('Impossible de supprimer : des clients sont abonnés à ce forfait');
    erreur.statut409 = true;
    throw erreur;
  }
  await db.query('DELETE FROM forfaits WHERE id = $1', [id]);
}

module.exports = { lister, detail, creer, modifier, supprimer };