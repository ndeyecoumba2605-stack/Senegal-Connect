// =========================================================================
// 1. ÉTAT GLOBAL & HELPER DE SESSION
// =========================================================================
let socket = null;
let ticketActifId = null;
let minuteurFrappe = null;
let filtreActif = 'tous';

// Récupération sécurisée du token et de l'utilisateur (Session / LocalStorage)
const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

const utilisateur = () => {
  const data = sessionStorage.getItem('utilisateur') || localStorage.getItem('utilisateur') || 
               sessionStorage.getItem('user') || localStorage.getItem('user');
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("Erreur de lecture de l'utilisateur dans le storage:", e);
    return null;
  }
};

// =========================================================================
// 2. GESTION D'INTERFACE D'APPEL VIDÉO & AUDIO (WEBRTC MODAL)
// =========================================================================
function afficherInterfaceAppel(titre = "Appel en cours...", estVideo = true) {
  const modal = document.getElementById('modal-appel');
  const titreEl = document.getElementById('titre-appel');
  const containerVideo = document.getElementById('container-flux-video');
  const interfaceAudio = document.getElementById('interface-audio-uniquement');
  const btnCam = document.getElementById('btn-couper-cam');

  if (titreEl) titreEl.textContent = titre;

  if (estVideo) {
    if (containerVideo) containerVideo.style.display = 'flex';
    if (interfaceAudio) interfaceAudio.style.display = 'none';
    if (btnCam) btnCam.style.display = 'inline-flex';
  } else {
    if (containerVideo) containerVideo.style.display = 'none';
    if (interfaceAudio) interfaceAudio.style.display = 'flex';
    if (btnCam) btnCam.style.display = 'none';
  }

  if (modal) {
    modal.classList.remove('cache');
    modal.style.display = 'flex';
  }
}

function masquerInterfaceAppel() {
  const modal = document.getElementById('modal-appel');
  if (modal) {
    modal.classList.add('cache');
    modal.style.display = 'none';
  }
}

// Handlers globaux WebRTC
window.gererAppelEntrant = function(donnees) {
  afficherInterfaceAppel(`Appel entrant de ${donnees.initiateur?.nom || 'Abonné'}...`, donnees.type === 'video');
};

window.gererAppelAccepte = function(donnees) {
  afficherInterfaceAppel("Appel connecté", donnees.type === 'video');
};

window.gererAppelRefuse = window.gererAppelTermine = function() {
  masquerInterfaceAppel();
};

// =========================================================================
// 3. CONNEXION WEBSOCKET (Socket.io)
// =========================================================================
function connecterSocket() {
  const jwt = token();
  if (!jwt) return;

  socket = io({ 
    auth: { token: jwt },
    transports: ['polling', 'websocket']
  });

  socket.on('connect', () => {
    console.log('Connecté au serveur Socket.io avec ID :', socket.id);
    // Si un ticket était ouvert avant reconnexion, rejoindre la room
    if (ticketActifId) {
      socket.emit('ticket:assigner', { ticketId: ticketActifId });
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Connexion Refusée :', err.message);
  });

  socket.on('ticket:nouveau', ajouterTicketDansListe);
  socket.on('ticket:pris_en_charge', rafraichirTicket);
  socket.on('ticket:ferme', rafraichirTicket);

  // RECEPTION DES MESSAGES TEMPS RÉEL (Client & Agent)
  socket.on('message:nouveau', (message) => {
    if (String(message.ticket_id) === String(ticketActifId)) {
      afficherMessage(message);
      accuserReceptionSiVisible(message);
    }
  });

  socket.on('message:statut', ({ messageId, statut }) => {
    const bulle = document.querySelector(`[data-message-id="${messageId}"] .accuse`);
    if (bulle) bulle.textContent = statut === 'lu' ? '✓✓' : '✓';
  });

  socket.on('frappe', ({ nom }) => afficherIndicateurFrappe(nom));
  socket.on('frappe:fin', masquerIndicateurFrappe);

  socket.on('reaction:mise_a_jour', ({ messageId, reactions }) => mettreAJourReactions(messageId, reactions));

  // Événements Télécom
  socket.on('appel:entrant', (donnees) => window.gererAppelEntrant && window.gererAppelEntrant(donnees));
  socket.on('appel:accepte', (donnees) => window.gererAppelAccepte && window.gererAppelAccepte(donnees));
  socket.on('appel:refuse', () => window.gererAppelRefuse && window.gererAppelRefuse());
  socket.on('appel:termine', () => window.gererAppelTermine && window.gererAppelTermine());
}

// =========================================================================
// 4. LOGIQUE DES TABLEAUX DE BORD (ADMIN / AGENT / CLIENT)
// =========================================================================
function initialiserInterfaceParRole() {
  const user = utilisateur();
  if (!user) return;

  const role = (user.role || 'client').toLowerCase();

  const elNom = document.getElementById('nom-utilisateur') || document.getElementById('userName');
  const elRole = document.getElementById('role-utilisateur') || document.getElementById('userRolePill');
  
  if (elNom) elNom.textContent = `${user.prenom || ''} ${user.nom || user.email}`.trim();
  if (elRole) elRole.textContent = role.toUpperCase();

  if (role === 'client') {
    document.querySelectorAll('.role-admin-only, .role-admin-agent').forEach(el => el.style.display = 'none');
  } else if (role === 'agent') {
    document.querySelectorAll('.role-admin-only').forEach(el => el.style.display = 'none');
  }

  document.querySelectorAll('.role-dash').forEach(dash => dash.style.display = 'none');
  
  const activeDash = document.getElementById(`dash-${role}`);
  if (activeDash) {
    activeDash.style.display = 'block';
  } else {
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
        if (document.getElementById('statAdminClients')) document.getElementById('statAdminClients').textContent = data.total_clients || 0;
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
      const clientId = user.client_id || user.id;
      const res = await fetch(`/api/clients/${clientId}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const profil = await res.json();
        if (document.getElementById('statClientForfait')) document.getElementById('statClientForfait').textContent = profil.forfait_nom || 'Standard';
        if (document.getElementById('statClientData')) document.getElementById('statClientData').textContent = profil.quota_data_go ? `${profil.quota_data_go} Go` : '0 Go';
        if (document.getElementById('statClientFacture')) document.getElementById('statClientFacture').textContent = profil.derniere_facture ? `${profil.derniere_facture} FCFA` : '0 FCFA';
      }
    }
  } catch (error) {
    console.warn('Erreur chargement statistiques :', error);
  }
}

// =========================================================================
// 5. NAVIGATION PAR ONGLETS
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
    if (targetId === 'sec-clients' && typeof chargerVraisClients === 'function') chargerVraisClients();
    if (targetId === 'sec-tickets') chargerTickets();
  });
});

// =========================================================================
// 6. GESTION DES TICKETS & MESSAGERIE (ENVOI TEXTE, FICHIERS & ÉMOJIS)
// =========================================================================
async function chargerTickets() {
  const container = document.getElementById('liste-tickets');
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
  const container = document.getElementById('liste-tickets');
  if (!container) return;

  const li = document.createElement('li');
  li.dataset.ticketId = ticket.id;
  li.className = 'item-ticket';
  li.innerHTML = `<strong>#${ticket.id}</strong> ${ticket.sujet} <span class="badge-statut ${ticket.statut}">${ticket.statut}</span>`;
  li.addEventListener('click', () => ouvrirTicket(ticket));
  container.prepend(li);
}

function rafraichirTicket(ticket) {
  const li = document.querySelector(`[data-ticket-id="${ticket.id}"]`);
  if (li) {
    const badge = li.querySelector('.badge-statut');
    if (badge) {
      badge.textContent = ticket.statut;
      badge.className = `badge-statut ${ticket.statut}`;
    }
  }
  const statutEl = document.getElementById('statut-ticket');
  if (ticket.id === ticketActifId && statutEl) statutEl.textContent = ticket.statut;
}

async function ouvrirTicket(ticket) {
  ticketActifId = ticket.id;
  window.ticketActifId = ticket.id;

  const chatVide = document.getElementById('chat-vide');
  const chatActif = document.getElementById('chat-actif');
  if (chatVide) chatVide.classList.add('cache');
  if (chatActif) chatActif.classList.remove('cache');

  const sujetEl = document.getElementById('sujet-ticket');
  const statutEl = document.getElementById('statut-ticket');
  if (sujetEl) sujetEl.textContent = `#${ticket.id} - ${ticket.sujet}`;
  if (statutEl) statutEl.textContent = ticket.statut;

  // Rejoindre la room de ce ticket pour recevoir tous les messages en temps réel
  if (socket && socket.connected) {
    socket.emit('ticket:assigner', { ticketId: ticket.id });
  }

  // Charge les détails complets de l'abonné associé au ticket
  chargerDetailsAbonne(ticket.client_id || ticket.user_id);

  const fil = document.getElementById('fil-messages');
  if (fil) fil.innerHTML = '';

  try {
    const reponse = await fetch(`/api/tickets/${ticket.id}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
    const { data } = await reponse.json();
    if (Array.isArray(data)) data.forEach(afficherMessage);
  } catch (e) {
    console.error('Erreur chargement messages:', e);
  }
}

// =========================================================================
// RECUPERATION ET AFFICHAGE DES DETAILS ABONNE
// =========================================================================
async function chargerDetailsAbonne(clientId) {
  const container = document.getElementById('details-abonne-container');
  if (!container) return;

  if (!clientId) {
    container.innerHTML = `<p style="color: #64748b; font-size: 0.9rem;">Aucun abonné associé à ce ticket.</p>`;
    return;
  }

  container.innerHTML = `<p style="color: #64748b; font-size: 0.9rem;">Chargement des données abonnés...</p>`;

  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${token()}` }
    });

    if (res.ok) {
      const client = await res.json();

      container.innerHTML = `
        <div class="fiche-abonne" style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem; color: #334155;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
            <strong style="font-size: 1.05rem; color: #0f172a; display: block;">${client.prenom || ''} ${client.nom || client.email || 'Client #' + clientId}</strong>
            <span style="font-size: 0.8rem; color: #64748b;">📧 ${client.email || 'Non renseigné'}</span><br>
            <span style="font-size: 0.8rem; color: #64748b;">📞 ${client.msisdn || client.telephone || 'Non renseigné'}</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div>
              <span style="color: #64748b; font-size: 0.8rem;">Forfait Actif :</span><br>
              <strong>${client.forfait_nom || 'Standard'}</strong>
            </div>

            <div>
              <span style="color: #64748b; font-size: 0.8rem;">Solde Data :</span><br>
              <strong style="color: #10b981;">${client.quota_data_go ? client.quota_data_go + ' Go' : '0 Go'}</strong>
            </div>

            <div>
              <span style="color: #64748b; font-size: 0.8rem;">Dernière Facture :</span><br>
              <strong style="color: ${client.facture_impayee ? '#ef4444' : '#059669'};">
                ${client.derniere_facture ? client.derniere_facture + ' FCFA' : '0 FCFA'} 
                ${client.facture_impayee ? '(Impayée)' : '(Réglée)'}
              </strong>
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;">Impossible de charger les infos abonné.</p>`;
    }
  } catch (err) {
    console.error("Erreur détails abonné :", err);
    container.innerHTML = `<p style="color: #ef4444; font-size: 0.85rem;">Erreur de connexion serveur.</p>`;
  }
}

function afficherMessage(message) {
  const fil = document.getElementById('fil-messages');
  if (!fil) return;

  // Éviter les doublons
  if (message.id && document.querySelector(`[data-message-id="${message.id}"]`)) {
    return;
  }

  const userActuel = utilisateur();
  const idExpediteur = message.expediteur_id || message.sender_id;
  const idMoi = userActuel?.id;
  const estMoi = String(idExpediteur) === String(idMoi);

  const div = document.createElement('div');
  div.className = `bulle-message ${estMoi ? 'moi' : 'autre'}`;
  if (message.id) div.dataset.messageId = message.id;

  div.style.margin = '8px 0';
  div.style.padding = '10px 14px';
  div.style.borderRadius = '12px';
  div.style.maxWidth = '70%';
  div.style.clear = 'both';
  div.style.wordBreak = 'break-word';

  if (estMoi) {
    div.style.float = 'right';
    div.style.backgroundColor = '#10b981';
    div.style.color = '#ffffff';
  } else {
    div.style.float = 'left';
    div.style.backgroundColor = '#e2e8f0';
    div.style.color = '#1e293b';
  }

  let contenuHtml = '';
  if (message.type === 'texte' || !message.type) {
    contenuHtml = `<p style="margin:0; padding:0;">${message.contenu}</p>`;
  } else if (message.type === 'image') {
    contenuHtml = `<img src="${message.fichier_url || message.contenu}" style="max-width: 100%; border-radius: 8px; display: block; margin-bottom: 4px;">`;
  } else if (message.type === 'audio') {
    contenuHtml = `<audio controls src="${message.fichier_url || message.contenu}" style="max-width: 100%;"></audio>`;
  } else {
    contenuHtml = `<a href="${message.fichier_url || message.contenu}" target="_blank" style="color: inherit; text-decoration: underline;">📄 ${message.fichier_nom || 'Télécharger le document'}</a>`;
  }

  div.innerHTML = `${contenuHtml}<span class="accuse" style="font-size: 0.65rem; opacity: 0.8; float: right; margin-left: 8px; margin-top: 4px;">✓</span>`;
  
  fil.appendChild(div);

  const cleaner = document.createElement('div');
  cleaner.style.clear = 'both';
  fil.appendChild(cleaner);

  fil.scrollTop = fil.scrollHeight;
}

function accuserReceptionSiVisible(message) {
  const userActuel = utilisateur();
  if (userActuel && String(message.expediteur_id) !== String(userActuel.id) && socket) {
    socket.emit('message:lu', { messageId: message.id, expediteurId: message.expediteur_id, ticketId: message.ticket_id });
  }
}

function afficherIndicateurFrappe(nom) {
  const zone = document.getElementById('indicateur-frappe');
  if (!zone) return;
  zone.textContent = `${nom} est en train d'écrire...`;
  zone.classList.remove('cache');
}

function masquerIndicateurFrappe() {
  const zone = document.getElementById('indicateur-frappe');
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

// Initialisation de la saisie de message, emojis et pièces jointes
function initialiserFormulaireMessage() {
  const formMessage = document.getElementById('form-message');
  const inputMessage = document.getElementById('input-message');
  const btnEmoji = document.getElementById('btn-emoji');
  const selecteurEmoji = document.getElementById('selecteur-emoji');
  const btnFichier = document.getElementById('btn-fichier');
  const inputFichier = document.getElementById('input-fichier');

  // A. SOUMISSION DU MESSAGE TEXTE
  if (formMessage) {
    formMessage.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!ticketActifId) {
        alert("Veuillez choisir ou ouvrir un ticket actif avant d'envoyer un message.");
        return;
      }

      const contenu = inputMessage.value.trim();
      if (!contenu) return;

      // Structure exacte attendue par support.js (ticketId, contenu, type)
      const payloadSocket = {
        ticketId: ticketActifId,
        contenu: contenu,
        type: 'texte'
      };

      if (socket && socket.connected) {
        socket.emit('message:envoyer', payloadSocket);
      } else {
        try {
          await fetch(`/api/tickets/${ticketActifId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token()}`
            },
            body: JSON.stringify(payloadSocket)
          });
        } catch (err) {
          console.error("Erreur d'envoi du message :", err);
        }
      }

      inputMessage.value = '';
      if (selecteurEmoji) selecteurEmoji.classList.add('cache');
    });

    if (inputMessage) {
      inputMessage.addEventListener('input', () => {
        if (!ticketActifId || !socket) return;
        const userActuel = utilisateur();
        socket.emit('frappe', { ticketId: ticketActifId, nom: userActuel?.prenom || userActuel?.nom || 'Abonné' });
      });
    }
  }

  // B. ÉMOJIS & STICKERS
  if (btnEmoji && selecteurEmoji) {
    btnEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      selecteurEmoji.classList.toggle('cache');
    });

    selecteurEmoji.querySelectorAll('span, img').forEach(element => {
      element.addEventListener('click', () => {
        if (inputMessage) {
          const valeur = element.getAttribute('data-emoji') || element.textContent;
          inputMessage.value += valeur;
          inputMessage.focus();
        }
        selecteurEmoji.classList.add('cache');
      });
    });

    document.addEventListener('click', (e) => {
      if (!selecteurEmoji.contains(e.target) && e.target !== btnEmoji) {
        selecteurEmoji.classList.add('cache');
      }
    });
  }

  // C. ENVOI DE FICHIER (IMAGES, DOCS, AUDIO)
  if (btnFichier && inputFichier) {
    btnFichier.addEventListener('click', () => inputFichier.click());

    inputFichier.addEventListener('change', async () => {
      if (!inputFichier.files || inputFichier.files.length === 0) return;
      
      if (!ticketActifId) {
        alert("Veuillez d'abord choisir un ticket.");
        inputFichier.value = '';
        return;
      }

      const fichier = inputFichier.files[0];
      const formData = new FormData();
      formData.append('fichier', fichier);
      formData.append('ticket_id', ticketActifId);

      try {
        const res = await fetch(`/api/tickets/${ticketActifId}/fichiers`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token()}` },
          body: formData
        });

        if (res.ok) {
          const json = await res.json();
          const messageData = json.data || json;

          let typeFichier = 'fichier';
          if (fichier.type.startsWith('image/')) typeFichier = 'image';
          else if (fichier.type.startsWith('audio/')) typeFichier = 'audio';

          const urlFichier = messageData.fichier_url || messageData.url || messageData.path;

          if (socket && socket.connected) {
            socket.emit('message:envoyer', {
              ticketId: ticketActifId,
              contenu: urlFichier,
              type: typeFichier
            });
          }
        } else {
          alert("Erreur serveur lors du téléchargement du fichier.");
        }
      } catch (err) {
        console.error("Erreur upload du fichier :", err);
        alert("Échec de l'envoi du fichier.");
      } finally {
        inputFichier.value = '';
      }
    });
  }
}

// =========================================================================
// 7. ÉCOUTEURS D'ÉVÉNEMENTS DES BOUTONS D'APPELS TÉLÉCOM
// =========================================================================
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-appel-video')) {
    if (!ticketActifId) return alert("Veuillez d'abord sélectionner un ticket actif.");
    afficherInterfaceAppel("Démarrage de l'appel visio...", true);
    if (typeof window.demarrerAppel === 'function') window.demarrerAppel(ticketActifId, 'video');
  }

  if (e.target.closest('#btn-appel-audio')) {
    if (!ticketActifId) return alert("Veuillez d'abord sélectionner un ticket actif.");
    afficherInterfaceAppel("Démarrage de l'appel audio...", false);
    if (typeof window.demarrerAppel === 'function') window.demarrerAppel(ticketActifId, 'audio');
  }

  if (e.target.closest('#btn-raccrocher')) {
    masquerInterfaceAppel();
    if (typeof window.terminerAppel === 'function') window.terminerAppel();
  }
});

// =========================================================================
// 8. DÉCONNEXION ET DÉMARRAGE
// =========================================================================
function deconnexion() {
  sessionStorage.clear();
  localStorage.clear();
  if (socket) socket.disconnect();
  window.location.replace('connexion.html');
}

const btnDeconnexion = document.getElementById('btn-deconnexion');
if (btnDeconnexion) {
  btnDeconnexion.addEventListener('click', deconnexion);
}

document.addEventListener('DOMContentLoaded', () => {
  const user = utilisateur();
  const jwt = token();

  if (!jwt || !user) {
    deconnexion();
  } else {
    initialiserInterfaceParRole();
    connecterSocket();
    chargerTickets();
    initialiserFormulaireMessage();

    if (user.role && user.role.toLowerCase() === 'admin') {
      if (typeof chargerVraisClients === 'function') chargerVraisClients();
    }
  }
});