// =========================================================================
// 1. ÉTAT GLOBAL & HELPER DE SESSION
// =========================================================================
let socket = null;
let ticketActifId = null;
let minuteurFrappe = null;
let filtreActif = 'tous';

// Récupération sécurisée du token et de l'utilisateur (prend en compte 'user' ou 'utilisateur')
const token = () => sessionStorage.getItem('token');
const utilisateur = () => {
  const data = sessionStorage.getItem('utilisateur') || sessionStorage.getItem('user');
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Erreur de lecture de l'utilisateur dans sessionStorage:", e);
    return null;
  }
};

// =========================================================================
// 2. CONNEXION WEBSOCKET (Socket.io)
// =========================================================================
function connecterSocket() {
  const jwt = token();
  if (!jwt) return;

  socket = io({ 
    auth: { token: jwt },
    transports: ['polling', 'websocket'] // <--- Très important pour synchroniser avec le serveur
  });

  socket.on('connect', () => {
    console.log('Connecté au serveur Socket.io avec ID :', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('Connexion Refusée :', err.message);
  });

  socket.on('ticket:nouveau', ajouterTicketDansListe);
  socket.on('ticket:pris_en_charge', rafraichirTicket);
  socket.on('ticket:ferme', rafraichirTicket);

  socket.on('message:nouveau', (message) => {
    if (message.ticket_id === ticketActifId) afficherMessage(message);
    accuserReceptionSiVisible(message);
  });

  socket.on('message:statut', ({ messageId, statut }) => {
    const bulle = document.querySelector(`[data-message-id="${messageId}"] .accuse`);
    if (bulle) bulle.textContent = statut === 'lu' ? '✓✓' : '✓';
  });

  socket.on('frappe', ({ nom }) => afficherIndicateurFrappe(nom));
  socket.on('frappe:fin', masquerIndicateurFrappe);

  socket.on('reaction:mise_a_jour', ({ messageId, reactions }) => mettreAJourReactions(messageId, reactions));

  socket.on('appel:entrant', (donnees) => window.gererAppelEntrant && window.gererAppelEntrant(donnees));
  socket.on('appel:accepte', (donnees) => window.gererAppelAccepte && window.gererAppelAccepte(donnees));
  socket.on('appel:refuse', () => window.gererAppelRefuse && window.gererAppelRefuse());
  socket.on('appel:termine', () => window.gererAppelTermine && window.gererAppelTermine());
  socket.on('appel:controle', (donnees) => window.gererControleDistant && window.gererControleDistant(donnees));
}

// =========================================================================
// 3. LOGIQUE DES TABLEAUX DE BORD (ADMIN / AGENT / CLIENT)
// =========================================================================
function initialiserInterfaceParRole() {
  const user = utilisateur();
  if (!user) return;

  const role = (user.role || 'client').toLowerCase();

  // Mettre à jour l'en-tête (Nom & Rôle)
  const elNom = document.getElementById('nom-utilisateur') || document.getElementById('userName');
  const elRole = document.getElementById('role-utilisateur') || document.getElementById('userRolePill');
  
  if (elNom) elNom.textContent = user.nom || user.email || 'Abonné';
  if (elRole) elRole.textContent = role;

  // Filtrer la navigation selon le rôle
  if (role === 'client') {
    document.querySelectorAll('.role-admin-only, .role-admin-agent').forEach(el => el.style.display = 'none');
  } else if (role === 'agent') {
    document.querySelectorAll('.role-admin-only').forEach(el => el.style.display = 'none');
  }

  // Masquer tous les tableaux de bord et afficher celui correspondant au rôle
  document.querySelectorAll('.role-dash').forEach(dash => dash.style.display = 'none');
  
  const activeDash = document.getElementById(`dash-${role}`);
  if (activeDash) {
    activeDash.style.display = 'block';
  } else {
    // Si l'élément dash-client / dash-agent / dash-admin n'est pas présent
    const dashFallback = document.getElementById('dash-client') || document.querySelector('.role-dash');
    if (dashFallback) dashFallback.style.display = 'block';
  }

  chargerStatsParRole();
}

async function chargerStatsParRole() {
  const user = utilisateur();
  if (!user) return;
  const role = (user.role || 'client').toLowerCase();

  try {
    if (role === 'admin') {
      const res = await fetch('/api/stats', { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json();
        if (document.getElementById('statAdminClients')) document.getElementById('statAdminClients').textContent = data.total_clients || data.total_clients_actifs || 0;
        if (document.getElementById('statAdminMRR')) document.getElementById('statAdminMRR').textContent = `${(data.mrr || 0).toLocaleString()} FCFA`;
        if (document.getElementById('statAdminFactures')) document.getElementById('statAdminFactures').textContent = data.factures_impayees || 0;
        if (document.getElementById('statAdminTickets')) document.getElementById('statAdminTickets').textContent = data.tickets_ouverts || 0;
      }
    } else if (role === 'agent') {
      const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const { data } = await res.json();
        const tickets = data || [];
        if (document.getElementById('statAgentEnAttente')) document.getElementById('statAgentEnAttente').textContent = tickets.filter(t => t.statut === 'ouvert').length;
        if (document.getElementById('statAgentMesTickets')) document.getElementById('statAgentMesTickets').textContent = tickets.filter(t => t.statut === 'en_cours').length;
      }
    } else if (role === 'client') {
      const res = await fetch('/api/auth/profil', { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const profil = await res.json();
        if (document.getElementById('statClientForfait')) document.getElementById('statClientForfait').textContent = profil.forfait ? profil.forfait.nom : 'Passeport Data';
        if (document.getElementById('statClientData')) document.getElementById('statClientData').textContent = profil.data_restante || '15.5 Go';
        if (document.getElementById('statClientFacture')) document.getElementById('statClientFacture').textContent = profil.derniere_facture ? `${profil.derniere_facture.montant_fcfa} FCFA` : '12 500 FCFA';
      }
    }
  } catch (error) {
    console.warn('Mode démo / serveur non joint pour les stats :', error);
  }
}

// =========================================================================
// 4. NAVIGATION PAR ONGLETS
// =========================================================================
document.querySelectorAll('.nav-btn').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));

    button.classList.add('active');
    const targetId = button.getAttribute('data-target');
    const sectionCible = document.getElementById(targetId);
    if (sectionCible) sectionCible.classList.add('active');

    if (targetId === 'sec-dashboard') chargerStatsParRole();
    if (targetId === 'sec-clients' && typeof chargerClients === 'function') chargerClients();
    if (targetId === 'sec-tickets') chargerTickets();
  });
});

// =========================================================================
// 5. GESTION DES TICKETS & MESSAGERIE
// =========================================================================
async function chargerTickets() {
  const container = document.getElementById('liste-tickets') || document.getElementById('ticketsList');
  if (!container) return;

  try {
    const reponse = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token()}` } });
    const { data } = await reponse.json();
    container.innerHTML = '';
    if (Array.isArray(data)) data.forEach(ajouterTicketDansListe);
  } catch (err) {
    console.error('Erreur chargement des tickets:', err);
  }
}

function ajouterTicketDansListe(ticket) {
  const container = document.getElementById('liste-tickets') || document.getElementById('ticketsList');
  if (!container) return;

  const li = document.createElement('li');
  li.dataset.ticketId = ticket.id;
  li.className = 'item-ticket';
  li.innerHTML = `<strong>#${ticket.id}</strong> ${ticket.sujet} <span class="badge-statut">${ticket.statut}</span>`;
  li.addEventListener('click', () => ouvrirTicket(ticket));
  container.prepend(li);
}

function rafraichirTicket(ticket) {
  const li = document.querySelector(`[data-ticket-id="${ticket.id}"]`);
  if (li) {
    const badge = li.querySelector('.badge-statut');
    if (badge) badge.textContent = ticket.statut;
  }
  const statutEl = document.getElementById('statut-ticket');
  if (ticket.id === ticketActifId && statutEl) statutEl.textContent = ticket.statut;
}

async function ouvrirTicket(ticket) {
  ticketActifId = ticket.id;

  const chatVide = document.getElementById('chat-vide');
  const chatActif = document.getElementById('chat-actif');
  if (chatVide) chatVide.classList.add('cache');
  if (chatActif) chatActif.classList.remove('cache');

  const sujetEl = document.getElementById('sujet-ticket') || document.getElementById('activeTicketTitle');
  const statutEl = document.getElementById('statut-ticket');
  if (sujetEl) sujetEl.textContent = `#${ticket.id} - ${ticket.sujet}`;
  if (statutEl) statutEl.textContent = ticket.statut;

  if (socket) socket.emit('ticket:assigner', { ticketId: ticket.id });

  const fil = document.getElementById('fil-messages') || document.getElementById('messagesZone');
  if (fil) fil.innerHTML = '';

  try {
    const reponse = await fetch(`/api/tickets/${ticket.id}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
    const { data } = await reponse.json();
    if (Array.isArray(data)) data.forEach(afficherMessage);
  } catch (e) {
    console.error('Erreur chargement messages:', e);
  }
}

function afficherMessage(message) {
  const fil = document.getElementById('fil-messages') || document.getElementById('messagesZone');
  if (!fil) return;

  const userActuel = utilisateur();
  const div = document.createElement('div');
  const estMoi = userActuel && message.expediteur_id === userActuel.id;
  div.className = `bulle-message ${estMoi ? 'moi' : 'autre'}`;
  div.dataset.messageId = message.id;

  let contenuHtml = '';
  if (message.type === 'texte' || !message.type) {
    contenuHtml = `<p>${message.contenu}</p>`;
  } else if (message.type === 'image') {
    contenuHtml = `<img src="${message.fichier_url}" class="apercu-image">`;
  } else if (message.type === 'audio') {
    contenuHtml = `<audio controls src="${message.fichier_url}"></audio>`;
  } else {
    contenuHtml = `<a href="${message.fichier_url}" target="_blank">📄 ${message.fichier_nom || 'Fichier'}</a>`;
  }

  div.innerHTML = `${contenuHtml}<span class="accuse">✓</span>`;
  fil.appendChild(div);
  fil.scrollTop = fil.scrollHeight;
}

function accuserReceptionSiVisible(message) {
  const userActuel = utilisateur();
  if (userActuel && message.ticket_id === ticketActifId && message.expediteur_id !== userActuel.id && socket) {
    socket.emit('message:lu', { messageId: message.id, expediteurId: message.expediteur_id, ticketId: message.ticket_id });
  }
}

function afficherIndicateurFrappe(nom) {
  const zone = document.getElementById('indicateur-frappe') || document.getElementById('typingIndicator');
  if (!zone) return;
  zone.textContent = `${nom} est en train d'écrire...`;
  zone.classList.remove('cache');
}

function masquerIndicateurFrappe() {
  const zone = document.getElementById('indicateur-frappe') || document.getElementById('typingIndicator');
  if (zone) zone.classList.add('cache');
}

function mettreAJourReactions(messageId, reactions) {
  const bulle = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!bulle) return;
  let zone = bulle.querySelector('.reactions');
  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'reactions';
    bulle.appendChild(zone);
  }
  zone.innerHTML = reactions.map(r => `${r.emoji} ${r.count}`).join(' ');
}

// =========================================================================
// 6. DÉCONNEXION ET VÉRIFICATION AU DÉMARRAGE
// =========================================================================
function deconnexion() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('utilisateur');
  sessionStorage.removeItem('user');
  if (socket) socket.disconnect();
  // Vérification de la page de connexion de destination
  window.location.replace('index.html'); // Remplacez par 'connexion.html' si votre page d'accueil de login porte ce nom exact
}

const btnDeconnexion = document.getElementById('btn-deconnexion') || document.getElementById('btnDeconnexion');
if (btnDeconnexion) {
  btnDeconnexion.addEventListener('click', deconnexion);
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  const user = utilisateur();
  const jwt = token();

  console.log("Vérification session -> Token:", jwt ? "OK" : "MANQUANT", "| User:", user);

  // Si le token ou l'utilisateur n'existe pas dans le sessionStorage
  if (!jwt || !user) {
    console.warn("Session absente ou invalide. Redirection...");
    deconnexion();
  } else {
    initialiserInterfaceParRole();
    connecterSocket();
    chargerTickets();
  }
});