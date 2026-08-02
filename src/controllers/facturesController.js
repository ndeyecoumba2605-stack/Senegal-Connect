const db = require('../config/db');

async function genererReference(periode) {
  const prefixe = `FAC-${periode.replace('-', '')}`;
  const compteur = await db.query(
    `SELECT COUNT(*) FROM factures WHERE reference LIKE $1`,
    [`${prefixe}%`]
  );
  const numero = String(parseInt(compteur.rows[0].count) + 1).padStart(4, '0');
  return `${prefixe}-${numero}`;
}

async function lister({ clientId, statut, periode, page = 1, limite = 20 }) {
  const conditions = [];
  const valeurs = [];

  if (clientId) { valeurs.push(clientId); conditions.push(`client_id = $${valeurs.length}`); }
  if (statut) { valeurs.push(statut); conditions.push(`statut = $${valeurs.length}`); }
  if (periode) { valeurs.push(periode); conditions.push(`periode = $${valeurs.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limite;

  const total = await db.query(`SELECT COUNT(*) FROM factures ${where}`, valeurs);
  const donnees = await db.query(
    `SELECT * FROM factures ${where} ORDER BY date_emission DESC LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
    [...valeurs, limite, offset]
  );

  return {
    data: donnees.rows,
    pagination: {
      total: parseInt(total.rows[0].count),
      page: Number(page),
      limite: Number(limite),
      total_pages: Math.ceil(total.rows[0].count / limite),
    },
  };
}

async function detail(id) {
  const facture = await db.query('SELECT * FROM factures WHERE id = $1', [id]);
  if (!facture.rows[0]) return null;

  const client = await db.query('SELECT * FROM clients WHERE id = $1', [facture.rows[0].client_id]);
  return { ...facture.rows[0], client: client.rows[0] || null };
}

async function creer({ client_id, periode, montant_fcfa, date_echeance }) {
  const reference = await genererReference(periode);
  const resultat = await db.query(
    `INSERT INTO factures (client_id, reference, periode, montant_fcfa, date_echeance)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [client_id, reference, periode, montant_fcfa, date_echeance || null]
  );
  return resultat.rows[0];
}

async function changerStatut(id, statut) {
  const resultat = await db.query(
    `UPDATE factures SET statut = $1 WHERE id = $2 RETURNING *`,
    [statut, id]
  );
  return resultat.rows[0];
}

module.exports = { lister, detail, creer, changerStatut };