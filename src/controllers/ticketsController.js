const db = require('../config/db');

async function listerTickets({ statut, agentId, clientId, page = 1, limite = 20 }) {
  const conditions = [];
  const valeurs = [];

  if (statut) { valeurs.push(statut); conditions.push(`statut = $${valeurs.length}`); }
  if (agentId) { valeurs.push(agentId); conditions.push(`agent_id = $${valeurs.length}`); }
  if (clientId) { valeurs.push(clientId); conditions.push(`client_id = $${valeurs.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limite;

  const total = await db.query(`SELECT COUNT(*) FROM tickets ${where}`, valeurs);
  const donnees = await db.query(
    `SELECT * FROM tickets ${where} ORDER BY ouvert_le DESC LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
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

async function creerTicket({ clientId, sujet }) {
  const resultat = await db.query(
    `INSERT INTO tickets (client_id, sujet) VALUES ($1, $2) RETURNING *`,
    [clientId, sujet]
  );
  return resultat.rows[0];
}

async function changerStatutTicket(id, statut) {
  const champsDate = statut === 'ferme' ? ', ferme_le = NOW()' : '';
  const resultat = await db.query(
    `UPDATE tickets SET statut = $1${champsDate} WHERE id = $2 RETURNING *`,
    [statut, id]
  );
  return resultat.rows[0];
}

async function assignerAgent(id, agentId) {
  const resultat = await db.query(
    `UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2 RETURNING *`,
    [agentId, id]
  );
  return resultat.rows[0];
}

async function historiqueMessages(ticketId, avant, limite = 50) {
  const conditions = ['ticket_id = $1'];
  const valeurs = [ticketId];
  if (avant) {
    valeurs.push(avant);
    conditions.push(`envoye_le < $${valeurs.length}`);
  }
  valeurs.push(limite);

  const resultat = await db.query(
    `SELECT * FROM messages WHERE ${conditions.join(' AND ')}
     ORDER BY envoye_le DESC LIMIT $${valeurs.length}`,
    valeurs
  );
  return resultat.rows.reverse();
}

async function historiqueAppels(ticketId) {
  const resultat = await db.query(
    `SELECT * FROM appels WHERE ticket_id = $1 ORDER BY debut_le DESC`,
    [ticketId]
  );
  return resultat.rows;
}

module.exports = {
  listerTickets,
  creerTicket,
  changerStatutTicket,
  assignerAgent,
  historiqueMessages,
  historiqueAppels,
};