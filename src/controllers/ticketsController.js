const db = require('../config/db');

async function listerTickets({ statut, agentId, clientId, page = 1, limite = 20 }) {
  const conditions = [];
  const valeurs = [];

  if (statut) { valeurs.push(statut); conditions.push(`t.statut = $${valeurs.length}`); }
  if (agentId) { valeurs.push(agentId); conditions.push(`t.agent_id = $${valeurs.length}`); }
  
  // Si clientId est fourni (id de utilisateurs), on filtre via la jointure clients
  if (clientId) { 
    valeurs.push(clientId); 
    conditions.push(`c.utilisateur_id = $${valeurs.length}`); 
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limite;

  const total = await db.query(
    `SELECT COUNT(*) FROM tickets t JOIN clients c ON t.client_id = c.id ${where}`, 
    valeurs
  );
  
  const donnees = await db.query(
    `SELECT t.* FROM tickets t 
     JOIN clients c ON t.client_id = c.id 
     ${where} 
     ORDER BY t.ouvert_le DESC 
     LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
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

// 🎯 CRÉATION DU TICKET CONFORME À SCHEMA.SQL
async function creerTicket({ clientId, sujet, description }) {
  // 1. Récupérer l'ID réel dans la table 'clients' correspondant à l'utilisateur connecté (utilisateurs.id)
  const clientRes = await db.query(
    'SELECT id FROM clients WHERE utilisateur_id = $1',
    [clientId]
  );

  if (clientRes.rows.length === 0) {
    throw new Error("Impossible de créer le ticket : aucun profil 'client' associé à cet utilisateur.");
  }

  const realClientId = clientRes.rows[0].id;

  // 2. Création du ticket lié à clients(id)
  const resultat = await db.query(
    `INSERT INTO tickets (client_id, sujet, statut, ouvert_le) 
     VALUES ($1, $2, 'ouvert', NOW()) 
     RETURNING *`,
    [realClientId, sujet]
  );
  
  const ticket = resultat.rows[0];

  // 3. Insertion de la description comme premier message texte dans la table 'messages'
  if (description && description.trim() !== '') {
    await db.query(
      `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, envoye_le)
       VALUES ($1, $2, 'texte', $3, NOW())`,
      [ticket.id, clientId, description]
    );
  }

  return ticket;
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

async function creerMessage({ ticketId, expediteurId, contenu }) {
  const resultat = await db.query(
    `INSERT INTO messages (ticket_id, expediteur_id, type, contenu, envoye_le)
     VALUES ($1, $2, 'texte', $3, NOW()) 
     RETURNING *`,
    [ticketId, expediteurId, contenu]
  );
  return resultat.rows[0];
}

module.exports = {
  listerTickets,
  creerTicket,
  changerStatutTicket,
  assignerAgent,
  historiqueMessages,
  historiqueAppels,
  creerMessage,
};