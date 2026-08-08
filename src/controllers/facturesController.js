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

// ── Génération automatique des factures mensuelles ──────────────────────
// Facture un mois pour tous les clients actifs abonnés à un forfait, en
// évitant tout doublon si la fonction est rejouée (idempotent) : on ne crée
// une facture que pour les clients qui n'en ont pas déjà une sur la période.
async function genererFacturesMensuelles(periode) {
  const p = periode || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const clientsAFacturer = await db.query(
    `SELECT c.id AS client_id, f.prix_mensuel_fcfa
     FROM clients c
     JOIN forfaits f ON f.id = c.forfait_id
     WHERE c.statut = 'actif'
       AND NOT EXISTS (
         SELECT 1 FROM factures fa WHERE fa.client_id = c.id AND fa.periode = $1
       )`,
    [p]
  );

  const facturesCreees = [];
  for (const client of clientsAFacturer.rows) {
    const facture = await creer({
      client_id: client.client_id,
      periode: p,
      montant_fcfa: client.prix_mensuel_fcfa,
    });
    facturesCreees.push(facture);
  }
  return facturesCreees;
}

// ── Passage automatique en retard ────────────────────────────────────────
// Toute facture "impayee" dont l'échéance est dépassée devient "en_retard".
async function marquerFacturesEnRetard() {
  const resultat = await db.query(
    `UPDATE factures SET statut = 'en_retard'
     WHERE statut = 'impayee' AND date_echeance < NOW()
     RETURNING id, reference, client_id`
  );
  return resultat.rows;
}

module.exports = {
  lister, detail, creer, changerStatut,
  genererFacturesMensuelles, marquerFacturesEnRetard,
};