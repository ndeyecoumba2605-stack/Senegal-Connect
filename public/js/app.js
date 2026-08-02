let socket = null;
let ticketActifId = null;
let minuteurFrappe = null;

const token = () => localStorage.getItem('token');
const utilisateur = () => JSON.parse(localStorage.getItem('utilisateur') || 'null');

function connecterSocket() {
  socket = io({ auth: { token: token() } });

  socket.on('connect_error', (err) => {
    console.error('Connexion refusée :', err.message);
    if (err.message === 'Token invalide') deconnexion();
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

  socket.on('appel:entrant', (donnees) => window.gererAppelEntrant(donnees));
  socket.on('appel:accepte', (donnees) => window.gererAppelAccepte(donnees));
  socket.on('appel:refuse', () => window.gererAppelRefuse());
  socket.on('appel:termine', () => window.gererAppelTermine());
  socket.on('appel:controle', (donnees) => window.gererControleDistant(donnees));
}

function deconnexion() {
  localStorage.removeItem('token');
  localStorage.removeItem('utilisateur');
  if (socket) socket.disconnect();
  window.location.href = 'connexion.html';
}
document.getElementById('btn-deconnexion').addEventListener('click', deconnexion);

// ===================== Tickets =====================
async function chargerTickets() {
  const reponse = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token()}` } });
  const { data } = await reponse.json();
  document.getElementById('liste-tickets').innerHTML = '';
  data.forEach(ajouterTicketDansListe);
}

function ajouterTicketDansListe(ticket) {
  const li = document.createElement('li');
  li.dataset.ticketId = ticket.id;
  li.className = 'item-ticket';
  li.innerHTML = `<strong>#${ticket.id}</strong> ${ticket.sujet} <span class="badge-statut">${ticket.statut}</span>`;
  li.addEventListener('click', () => ouvrirTicket(ticket));
  document.getElementById('liste-tickets').prepend(li);
}

function rafraichirTicket(ticket) {
  const li = document.querySelector(`[data-ticket-id="${ticket.id}"]`);
  if (li) li.querySelector('.badge-statut').textContent = ticket.statut;
  if (ticket.id === ticketActifId) document.getElementById('statut-ticket').textContent = ticket.statut;
}

async function ouvrirTicket(ticket) {
  ticketActifId = ticket.id;
  document.getElementById('chat-vide').classList.add('cache');
  document.getElementById('chat-actif').classList.remove('cache');
  document.getElementById('sujet-ticket').textContent = ticket.sujet;
  document.getElementById('statut-ticket').textContent = ticket.statut;

  socket.emit('ticket:assigner', { ticketId: ticket.id });

  document.getElementById('fil-messages').innerHTML = '';
  const reponse = await fetch(`/api/tickets/${ticket.id}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
  const { data } = await reponse.json();
  data.forEach(afficherMessage);
}

document.getElementById('btn-nouveau-ticket').addEventListener('click', () => {
  const sujet = prompt('Sujet du ticket :');
  if (sujet) socket.emit('ticket:ouvrir', { sujet });
});
document.getElementById('btn-fermer-ticket').addEventListener('click', () => {
  if (ticketActifId) socket.emit('ticket:fermer', { ticketId: ticketActifId });
});

// ===================== Messages =====================
document.getElementById('form-message').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('input-message');
  if (!input.value.trim() || !ticketActifId) return;
  socket.emit('message:envoyer', { ticketId: ticketActifId, contenu: input.value });
  input.value = '';
});

document.getElementById('input-message').addEventListener('input', () => {
  if (!ticketActifId) return;
  clearTimeout(minuteurFrappe);
  socket.emit('frappe', { ticketId: ticketActifId, nom: utilisateur().nom });
  minuteurFrappe = setTimeout(() => {}, 1000);
});

function afficherMessage(message) {
  const div = document.createElement('div');
  div.className = `bulle-message ${message.expediteur_id === utilisateur().id ? 'moi' : 'autre'}`;
  div.dataset.messageId = message.id;

  let contenuHtml = '';
  if (message.type === 'texte') {
    contenuHtml = `<p>${message.contenu}</p>`;
  } else if (message.type === 'image') {
    contenuHtml = `<img src="${message.fichier_url}" class="apercu-image">`;
  } else if (message.type === 'audio') {
    contenuHtml = `<audio controls src="${message.fichier_url}"></audio>`;
  } else {
    contenuHtml = `<a href="${message.fichier_url}" target="_blank">📄 ${message.fichier_nom} (${Math.round(message.fichier_taille / 1024)} Ko)</a>`;
  }

  div.innerHTML = `${contenuHtml}<span class="accuse">✓</span>`;
  document.getElementById('fil-messages').appendChild(div);
  document.getElementById('fil-messages').scrollTop = 1e9;
}

function accuserReceptionSiVisible(message) {
  if (message.ticket_id === ticketActifId && message.expediteur_id !== utilisateur().id) {
    socket.emit('message:lu', { messageId: message.id, expediteurId: message.expediteur_id, ticketId: message.ticket_id });
  }
}

function afficherIndicateurFrappe(nom) {
  const zone = document.getElementById('indicateur-frappe');
  zone.textContent = `${nom} est en train d'écrire...`;
  zone.classList.remove('cache');
}
function masquerIndicateurFrappe() {
  document.getElementById('indicateur-frappe').classList.add('cache');
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

// ===================== Émojis =====================
document.getElementById('btn-emoji').addEventListener('click', () => {
  document.getElementById('selecteur-emoji').classList.toggle('cache');
});
document.querySelectorAll('#selecteur-emoji span').forEach((span) => {
  span.addEventListener('click', () => {
    if (!ticketActifId) return;
    socket.emit('message:envoyer', { ticketId: ticketActifId, contenu: span.textContent, type: 'texte' });
    document.getElementById('selecteur-emoji').classList.add('cache');
  });
});

// ===================== Partage de fichiers =====================
document.getElementById('btn-fichier').addEventListener('click', () => {
  document.getElementById('input-fichier').click();
});
document.getElementById('input-fichier').addEventListener('change', async (e) => {
  const fichier = e.target.files[0];
  if (!fichier || !ticketActifId) return;

  const formData = new FormData();
  formData.append('fichier', fichier);

  await fetch(`/api/tickets/${ticketActifId}/fichier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: formData,
  });
  e.target.value = '';
});

// ===================== Démarrage =====================
if (utilisateur()) {
  document.getElementById('nom-utilisateur').textContent = utilisateur().nom;
  document.getElementById('role-utilisateur').textContent = utilisateur().role;
}
connecterSocket();
chargerTickets();