const db = require('../config/db');

async function listerTickets({ statut, agentId, clientId, page = 1, limite = 20, restreindreAgentId }) {
  const conditions = [];
  const valeurs = [];

  if (statut) { valeurs.push(statut); conditions.push(`t.statut = $${valeurs.length}`); }
  if (agentId) { valeurs.push(agentId); conditions.push(`t.agent_id = $${valeurs.length}`); }
  
  if (clientId) { 
    valeurs.push(clientId); 
    conditions.push(`c.id = $${valeurs.length}`); 
  }

  // L'agent peut voir tous les tickets dans la file. L'accÃ¨s exact reste
  // contrÃ´lÃ© par l'API lorsqu'il tente d'ouvrir un ticket dÃ©jÃ  pris par un
  // collÃ¨gue.
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limite;

  const total = await db.query(
    `SELECT COUNT(*) FROM tickets t JOIN clients c ON t.client_id = c.id ${where}`, 
    valeurs
  );
  
  // LEFT JOIN vers utilisateurs pour exposer le nom du client ET celui de
  // l'agent assignÃ© (utile pour la vue admin : "quel agent a pris en charge
  // ce ticket, pour quel client").
  const donnees = await db.query(
    `SELECT t.*,
            uc.nom AS client_nom, uc.prenom AS client_prenom, c.msisdn AS client_msisdn,
            ua.nom AS agent_nom, ua.prenom AS agent_prenom
     FROM tickets t 
     JOIN clients c ON t.client_id = c.id 
     JOIN utilisateurs uc ON uc.id = c.utilisateur_id
     LEFT JOIN utilisateurs ua ON ua.id = t.agent_id
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

// ðŸŽ¯ CRÃ‰ATION DU TICKET CONFORME Ã€ SCHEMA.SQL
async function creerTicket({ clientId, sujet, description }) {
  // 1. RÃ©cupÃ©rer l'ID rÃ©el dans la table 'clients' correspondant Ã  l'utilisateur connectÃ© (utilisateurs.id)
  const clientRes = await db.query(
    'SELECT id FROM clients WHERE utilisateur_id = $1',
    [clientId]
  );

  if (clientRes.rows.length === 0) {
    throw new Error("Impossible de crÃ©er le ticket : aucun profil 'client' associÃ© Ã  cet utilisateur.");
  }

  const realClientId = clientRes.rows[0].id;

  // 2. CrÃ©ation du ticket liÃ© Ã  clients(id)
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
  // ExclusivitÃ© : un ticket dÃ©jÃ  pris en charge par un AUTRE agent ne peut pas
  // Ãªtre rÃ©assignÃ©. RÃ©appeler avec le mÃªme agentId (idempotent) reste autorisÃ©.
  const existant = await db.query(`SELECT agent_id FROM tickets WHERE id = $1`, [id]);
  if (existant.rows.length === 0) return null;
  if (existant.rows[0].agent_id && existant.rows[0].agent_id !== agentId) {
    const erreur = new Error('Ce ticket est dÃ©jÃ  pris en charge par un autre agent');
    erreur.statut409 = true;
    throw erreur;
  }

  const resultat = await db.query(
    `UPDATE tickets SET agent_id = $1, statut = 'en_cours' WHERE id = $2 RETURNING *`,
    [agentId, id]
  );
  return resultat.rows[0];
}

// â”€â”€ ContrÃ´le d'accÃ¨s centralisÃ© Ã  un ticket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Par dÃ©faut, l'accÃ¨s concerne les actions mÃ©tier: un agent doit Ãªtre
// assignÃ© au ticket. La seule exception est ticket:rejoindre, qui peut
// autoriser temporairement un agent Ã  rejoindre un ticket non assignÃ© afin
// de pouvoir le prendre en charge.
async function verifierAccesTicket(ticketId, user, options = {}) {
  const { allowUnassignedAgent = false } = options;
  const role = String(user?.role || '').toLowerCase();
  const resultat = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  const ticket = resultat.rows[0];

  if (!ticket) {
    return { ticket: null, autorise: false, raison: 'introuvable' };
  }

  if (role === 'admin') {
    return { ticket, autorise: true, raison: 'admin' };
  }

  if (role === 'agent') {
    const estAgentAssigne = String(ticket.agent_id || '') === String(user.id);
    const estTicketDisponible = allowUnassignedAgent && !ticket.agent_id;
    return {
      ticket,
      autorise: estAgentAssigne || estTicketDisponible,
      raison: estAgentAssigne ? 'agent_assigne' : estTicketDisponible ? 'ticket_disponible' : 'agent_non_assigne',
    };
  }

  if (role === 'client') {
    const clientRes = await db.query(
      'SELECT id FROM clients WHERE utilisateur_id = $1',
      [user.id]
    );
    const monClientId = clientRes.rows[0]?.id;
    return {
      ticket,
      autorise: String(monClientId || '') === String(ticket.client_id || ''),
      raison: String(monClientId || '') === String(ticket.client_id || '') ? 'client_proprietaire' : 'client_autre',
    };
  }

  return { ticket, autorise: false, raison: 'role_inconnu' };
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
  verifierAccesTicket,
  historiqueMessages,
  historiqueAppels,
  creerMessage,
};