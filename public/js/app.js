// =========================================================================
// 1. ÉTAT GLOBAL & HELPER DE SESSION
// =========================================================================
console.log('[Sénégal Connect] app.js build 2026-08-09 19:33 UTC');
let socket = null;
let ticketActifId = null;
let ticketActifDonnees = null; // dernier objet ticket ouvert (agent_id, client_id, statut...)
let minuteurFrappe = null;
let filtreActif = 'tous';
let tousLesTickets = []; // Tableau global pour stocker la liste et permettre le filtrage en mémoire

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
    path: '/socket.io',
    auth: { token: jwt },
    transports: ['polling']
  });

  socket.on('connect', () => {
    console.log('Connecté au serveur Socket.io avec ID :', socket.id);
    // Si un ticket était ouvert avant reconnexion, on rejoint sa room en LECTURE
    // uniquement (ne jamais ré-assigner automatiquement le ticket à la reconnexion).
    if (ticketActifId) {
      socket.emit('ticket:rejoindre', { ticketId: ticketActifId });
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Connexion Refusée :', err.message);
  });

  // Messages d'erreur métier émis par le serveur (ex: ticket déjà pris par un
  // autre agent, accès refusé...) : on les affiche simplement à l'utilisateur.
  socket.on('erreur', ({ message }) => {
    if (message) alert(message);
  });

  socket.on('ticket:nouveau', (ticket) => {
    tousLesTickets.unshift(ticket);
    afficherTicketsFiltres();
  });
  socket.on('ticket:pris_en_charge', rafraichirTicket);
  socket.on('ticket:mis_a_jour', rafraichirTicket);
  socket.on('ticket:ferme', rafraichirTicket);

  // Un ticket vient d'être pris en charge par un agent (potentiellement un
  // autre) : pour un AGENT, ce ticket doit purement et simplement disparaître
  // de sa file s'il ne lui appartient pas — pas juste être mis à jour dans
  // l'interface, sinon il resterait visible avec un statut "pris par un
  // autre agent" au lieu de disparaître complètement comme demandé.
  // L'admin, lui, voit tout : on met juste à jour l'entrée existante.
  socket.on('ticket:pris', ({ id, agent_id }) => {
    const user = utilisateur();
    const index = tousLesTickets.findIndex(t => String(t.id) === String(id));

    if (index !== -1) {
      tousLesTickets[index] = {
        ...tousLesTickets[index],
        agent_id,
        statut: 'en_cours',
      };
    }

    afficherTicketsFiltres();

    if (String(id) === String(ticketActifId)) {
      mettreAJourEtatPriseEnCharge({ ...ticketActifDonnees, agent_id });
    }
  });

  // RECEPTION DES MESSAGES TEMPS RÉEL (Client & Agent)
  socket.on('message:nouveau', (message) => {
    if (String(message.ticket_id) === String(ticketActifId)) {
      afficherMessage(message);
      accuserReceptionSiVisible(message);
    }
  });

  socket.on('message:statut', ({ messageId, statut, utilisateurId }) => {
    mettreAJourStatutMessage(messageId, statut, utilisateurId);
  });

  socket.on('frappe', ({ nom }) => afficherIndicateurFrappe(nom));
  socket.on('frappe:fin', masquerIndicateurFrappe);

  socket.on('reaction:mise_a_jour', ({ messageId, reactions }) => mettreAJourReactions(messageId, reactions));

  // Événements Télécom
  socket.on('appel:entrant', (donnees) => window.gererAppelEntrant && window.gererAppelEntrant(donnees));
  socket.on('appel:accepte', (donnees) => window.gererAppelAccepte && window.gererAppelAccepte(donnees));
  socket.on('appel:refuse', () => window.gererAppelRefuse && window.gererAppelRefuse());
  socket.on('appel:termine', () => window.gererAppelTermine && window.gererAppelTermine());
  socket.on('appel:reaction', (donnees) => window.gererAppelReaction && window.gererAppelReaction(donnees));
  socket.on('appel:controle', (donnees) => window.gererControleDistant && window.gererControleDistant(donnees));
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
    document.querySelectorAll('.role-client-only').forEach(el => el.style.display = 'inline-flex');
  } else if (role === 'agent') {
    document.querySelectorAll('.role-admin-only, .role-client-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.role-admin-agent').forEach(el => el.style.display = 'inline-flex');
  } else if (role === 'admin') {
    document.querySelectorAll('.role-client-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.role-admin-only, .role-admin-agent').forEach(el => el.style.display = 'inline-flex');
  }

  const boutonNouveauTicket = document.getElementById('btn-nouveau-ticket');
  if (boutonNouveauTicket) {
    boutonNouveauTicket.style.display = role === 'client' ? 'inline-flex' : 'none';
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
        if (document.getElementById('statAdminClients')) document.getElementById('statAdminClients').textContent = data.clients_actifs || 0;
        if (document.getElementById('statAdminMRR')) document.getElementById('statAdminMRR').textContent = `${(data.revenu_mensuel_fcfa || 0).toLocaleString()} FCFA`;
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
    if (targetId === 'sec-agents') chargerAgents();
    if (targetId === 'sec-forfaits') chargerForfaits();
    if (targetId === 'sec-factures') chargerFactures();
    if (targetId === 'sec-mon-forfait') chargerMonForfait();
    if (targetId === 'sec-mes-factures') chargerMesFactures();
    if (targetId === 'sec-mon-profil' && typeof window.chargerMonProfil === 'function') window.chargerMonProfil();
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
    
    tousLesTickets = Array.isArray(data) ? data : [];
    afficherTicketsFiltres();
  } catch (err) {
    console.error('Erreur chargement des tickets:', err);
  }
}

// Filtrage effectif selon le statut choisi dans le menu déroulant
function afficherTicketsFiltres() {
  const container = document.getElementById('liste-tickets');
  if (!container) return;

  container.innerHTML = '';

  const ticketsFiltres = tousLesTickets.filter(ticket => {
    if (filtreActif === 'tous') return true;
    return String(ticket.statut).toLowerCase() === String(filtreActif).toLowerCase();
  });

  if (ticketsFiltres.length === 0) {
    container.innerHTML = `<li style="padding: 1rem; text-align: center; color: #64748b; font-size: 0.85rem;">
      Aucun ticket avec le statut "${filtreActif}"
    </li>`;
    return;
  }

  ticketsFiltres.forEach(ajouterTicketDansListe);
}

function ajouterTicketDansListe(ticket) {
  const container = document.getElementById('liste-tickets');
  if (!container) return;

  const existant = container.querySelector(`[data-ticket-id="${ticket.id}"]`);
  if (existant) existant.remove();

  const li = document.createElement('li');
  li.dataset.ticketId = ticket.id;
  li.dataset.statut = ticket.statut;
  li.className = 'item-ticket';

  const user = utilisateur();
  const estTicketAssigné = ticket.agent_id;
  const estPrisParMoi = estTicketAssigné && String(ticket.agent_id) === String(user?.id);
  const estPrisParAutre = estTicketAssigné && !estPrisParMoi;

  if (estPrisParAutre && user?.role === 'agent') {
    li.classList.add('ticket-pris-autre');
  }
  if (String(ticket.id) === String(ticketActifId)) {
    li.classList.add('active');
  }

  const nomAgent = ticket.agent_nom ? ` ${ticket.agent_prenom || ''} ${ticket.agent_nom}`.trim() : '';
  const attribution = estTicketAssigné
    ? `<div class="ticket-agent-info">Pris en charge par${estPrisParMoi ? ' vous' : nomAgent || ' un agent'}</div>`
    : '';

  li.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;">
      <strong>#${ticket.id}</strong>
      <span class="badge-statut ${ticket.statut}">${ticket.statut}</span>
    </div>
    <div style="margin-top:0.25rem; color:#475569; font-size:0.9rem;">${ticket.sujet}</div>
    ${attribution}
  `;

  li.addEventListener('click', () => {
    if (estPrisParAutre && user?.role === 'agent') {
      alert('Ce ticket est déjà pris en charge par un autre agent et n\'est pas accessible.');
      return;
    }

    document.querySelectorAll('#liste-tickets .item-ticket').forEach(el => el.classList.remove('active'));
    li.classList.add('active');
    ouvrirTicket(ticket);
  });

  container.appendChild(li);
}

function rafraichirTicket(ticket) {
  const index = tousLesTickets.findIndex(t => String(t.id) === String(ticket.id));
  if (index !== -1) {
    tousLesTickets[index] = { ...tousLesTickets[index], ...ticket };
  } else {
    tousLesTickets.unshift(ticket);
  }

  afficherTicketsFiltres();

  if (String(ticket.id) === String(ticketActifId)) {
    ticketActifDonnees = { ...ticketActifDonnees, ...ticket };
    mettreAJourEtatPriseEnCharge(ticketActifDonnees);
    mettreAJourEtatDiscussion(ticketActifDonnees);

    // Si un agent vient d'être assigné, un client peut désormais l'appeler.
    const user = utilisateur();
    if (user?.role === 'client' && ticket.agent_id) {
      window.ticketActifAutrePartieId = ticket.agent_id;
    }

    const statutEl = document.getElementById('statut-ticket');
    if (statutEl) {
      statutEl.textContent = ticket.statut;
      statutEl.className = `badge-statut ${ticket.statut}`;
    }
  }
}

function initialiserFiltreTickets() {
  const selectFiltre = document.getElementById('filtre-statut');
  if (selectFiltre) {
    selectFiltre.addEventListener('change', (e) => {
      filtreActif = e.target.value;
      afficherTicketsFiltres();
    });
  }
}

function initialiserCreationTicket() {
  const boutonNouveau = document.getElementById('btn-nouveau-ticket');
  const modalTicket = document.getElementById('modale-nouveau-ticket');
  const formTicket = document.getElementById('form-creer-ticket');
  const btnFermerTicket = document.getElementById('btn-fermer-modale-ticket');
  const inputSujet = document.getElementById('ticket-sujet');
  const inputDescription = document.getElementById('ticket-description');

  if (boutonNouveau && modalTicket) {
    boutonNouveau.addEventListener('click', () => {
      modalTicket.classList.remove('cache');
    });
  }

  if (btnFermerTicket && modalTicket) {
    btnFermerTicket.addEventListener('click', () => {
      modalTicket.classList.add('cache');
    });
  }

  if (formTicket) {
    formTicket.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!inputSujet || !inputDescription) return;

      const sujet = inputSujet.value.trim();
      const description = inputDescription.value.trim();
      if (!sujet) {
        alert('Le sujet du ticket est requis.');
        return;
      }

      try {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({ sujet, description }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Impossible de créer le ticket.');
          return;
        }

        if (modalTicket) modalTicket.classList.add('cache');
        inputSujet.value = '';
        inputDescription.value = '';

        await chargerTickets();
        if (data && data.id) {
          ouvrirTicket(data);
        }
      } catch (err) {
        console.error('Erreur création du ticket :', err);
        alert('Erreur lors de la création du ticket.');
      }
    });
  }
}

async function ouvrirTicket(ticket) {
  const user = utilisateur();
  if (user?.role === 'agent' && ticket.agent_id && String(ticket.agent_id) !== String(user.id)) {
    alert('Ce ticket est pris en charge par un autre agent et vous ne pouvez pas y accéder.');
    return;
  }

  ticketActifId = ticket.id;
  window.ticketActifId = ticket.id;
  ticketActifDonnees = ticket;
  window.ticketActifAutrePartieId = null; // recalculé ci-dessous

  const chatVide = document.getElementById('chat-vide');
  const chatActif = document.getElementById('chat-actif');
  if (chatVide) chatVide.classList.add('cache');
  if (chatActif) chatActif.classList.remove('cache');

  // Sur mobile, masque la liste des tickets pour ne montrer que la
  // conversation (cf. media query dans app.css) — évite tout chevauchement
  // visuel entre la liste et l'en-tête du chat sur petit écran.
  const corpsApp = document.querySelector('.corps-app');
  if (corpsApp) corpsApp.classList.add('ticket-ouvert-mobile');

  const sujetEl = document.getElementById('sujet-ticket');
  const statutEl = document.getElementById('statut-ticket');
  if (sujetEl) sujetEl.textContent = `#${ticket.id} - ${ticket.sujet}`;
  if (statutEl) {
    statutEl.textContent = ticket.statut;
    statutEl.className = `badge-statut ${ticket.statut}`;
  }

  // Rejoindre la room de ce ticket EN LECTURE SEULE pour recevoir les messages
  // en temps réel. La prise en charge est une action distincte et explicite
  // (bouton "Prendre en charge"), jamais déclenchée par la simple ouverture.
  if (socket && socket.connected) {
    socket.emit('ticket:rejoindre', { ticketId: ticket.id });
  }

  if (utilisateur()?.role === 'client') {
    // Pour un client, l'autre partie de l'appel est l'agent assigné au ticket
    // (agent_id référence directement utilisateurs.id).
    window.ticketActifAutrePartieId = ticket.agent_id || null;
  }

  mettreAJourEtatPriseEnCharge(ticket);
  mettreAJourEtatDiscussion(ticket);

  // Charge les détails complets de l'abonné associé au ticket (renseigne aussi
  // l'ID utilisateur du client, nécessaire pour qu'un agent puisse l'appeler)
  chargerDetailsAbonne(ticket.client_id || ticket.user_id);

  const fil = document.getElementById('fil-messages');
  if (fil) fil.innerHTML = '';

  try {
    const reponse = await fetch(`/api/tickets/${ticket.id}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
    if (reponse.status === 403) {
      if (fil) fil.innerHTML = '<p style="padding:1rem;color:#ef4444;">Ce ticket est pris en charge par un autre agent — vous n\'y avez pas accès.</p>';
      return;
    }
    const { data } = await reponse.json();
    if (Array.isArray(data)) {
      data.forEach(afficherMessage);
      // La marque 'lu' est gérée automatiquement côté serveur lors de
      // l'événement 'ticket:rejoindre' (le client a déjà émis cet event).
    }
  } catch (e) {
    console.error('Erreur chargement messages:', e);
  }
}

// Met à jour le bouton "Prendre en charge" et l'état des boutons d'appel
// selon qui est propriétaire du ticket actif.
function mettreAJourEtatPriseEnCharge(ticket) {
  const user = utilisateur();
  const btnAssigner = document.getElementById('btn-assigner-ticket');
  const btnAppelAudio = document.getElementById('btn-appel-audio');
  const btnAppelVideo = document.getElementById('btn-appel-video');

  if (btnAssigner) {
    // L'admin supervise mais ne prend jamais en charge un ticket lui-même —
    // seul un agent peut se l'assigner. Pour l'admin, ce bouton devient un
    // simple indicateur en lecture seule de qui traite le ticket.
    if (user?.role === 'agent') {
      btnAssigner.style.display = 'inline-flex';
      if (!ticket.agent_id) {
        btnAssigner.disabled = false;
        btnAssigner.innerHTML = '<i class="fa-solid fa-user-check"></i> Prendre en charge';
      } else if (String(ticket.agent_id) === String(user.id)) {
        btnAssigner.disabled = true;
        btnAssigner.innerHTML = '<i class="fa-solid fa-check"></i> Pris en charge par vous';
      } else {
        btnAssigner.disabled = true;
        btnAssigner.innerHTML = '<i class="fa-solid fa-lock"></i> Pris en charge par un autre agent';
      }
    } else if (user?.role === 'admin') {
      btnAssigner.style.display = 'inline-flex';
      btnAssigner.disabled = true;
      const nomAgent = ticket.agent_nom
        ? `${ticket.agent_prenom || ''} ${ticket.agent_nom}`.trim()
        : null;
      btnAssigner.innerHTML = nomAgent
        ? `<i class="fa-solid fa-user-tie"></i> Pris en charge par ${nomAgent}`
        : '<i class="fa-solid fa-circle-question"></i> Non assigné';
    } else {
      btnAssigner.style.display = 'none';
    }
  }

  // Un client ne peut appeler que si un agent a déjà pris en charge le ticket.
  if (user?.role === 'client') {
    const dispo = !!ticket.agent_id;
    if (btnAppelAudio) btnAppelAudio.disabled = !dispo;
    if (btnAppelVideo) btnAppelVideo.disabled = !dispo;
    if (!dispo) {
      if (btnAppelAudio) btnAppelAudio.title = "Disponible une fois qu'un agent a pris en charge le ticket";
      if (btnAppelVideo) btnAppelVideo.title = "Disponible une fois qu'un agent a pris en charge le ticket";
    }
  }

  // Verrouille l'interface de discussion si le ticket est fermé.
  mettreAJourEtatDiscussion(ticket);
}

function mettreAJourEtatDiscussion(ticket) {
  const ferme = ticket?.statut === 'ferme';
  const formMessage = document.getElementById('form-message');
  const inputMessage = document.getElementById('input-message');
  const btnEmoji = document.getElementById('btn-emoji');
  const btnFichier = document.getElementById('btn-fichier');
  const selecteurEmoji = document.getElementById('selecteur-emoji');
  const btnFermer = document.getElementById('btn-fermer-ticket');
  const btnAppelAudio = document.getElementById('btn-appel-audio');
  const btnAppelVideo = document.getElementById('btn-appel-video');
  const btnAssigner = document.getElementById('btn-assigner-ticket');

  [btnAppelAudio, btnAppelVideo, btnAssigner, btnFermer, btnEmoji, btnFichier, inputMessage].forEach((control) => {
    if (control) control.disabled = ferme;
  });

  if (formMessage) {
    formMessage.style.opacity = ferme ? '0.6' : '';
    formMessage.querySelectorAll('input, button').forEach((el) => {
      if (el) el.disabled = ferme;
    });
  }

  if (selecteurEmoji && ferme) {
    selecteurEmoji.classList.add('cache');
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

      // Pour un agent/admin, l'autre partie de l'appel est le CLIENT : on a
      // besoin de son utilisateur_id (et non clients.id) pour émettre
      // "appel:initier" vers la bonne room "user:{id}".
      const user = utilisateur();
      if ((user?.role === 'agent' || user?.role === 'admin') && client.utilisateur_id) {
        window.ticketActifAutrePartieId = client.utilisateur_id;
      }

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
  // .fil-messages est un conteneur flex (flex-direction: column) : float
  // n'a AUCUN effet sur les enfants d'un flex container. L'alignement
  // gauche/droite se fait via align-self, déjà défini dans app.css pour
  // les classes "envoye" (droite, mes messages) et "recu" (gauche, reçus).
  div.className = `bulle-message ${estMoi ? 'envoye' : 'recu'}`;
  if (message.id) div.dataset.messageId = message.id;

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

  const statutTexte = estMoi ? 'pending' : '';
  // Si le serveur a indiqué que le message a déjà été lu par le destinataire,
  // afficher directement la double coche.
  // Determine if this message has been read by any other participant
  let lusPar = message.lus_par || message.lusPar || message.lu_par_destinataire;
  if (typeof lusPar === 'string') {
    try { lusPar = JSON.parse(lusPar); } catch (e) { /* ignore */ }
  }
  const dejaLuParDest = estMoi && Array.isArray(lusPar) && lusPar.some(id => String(id) !== String(userActuel?.id));
  div.innerHTML = `
    ${contenuHtml}
    ${estMoi ? (dejaLuParDest ? `<span class="accuse read" data-lu="true" style="float: right; margin-left: 8px; margin-top: 4px;"><i class="fa-solid fa-check-double"></i></span>` : `<span class="accuse pending" data-lu="false" style="float: right; margin-left: 8px; margin-top: 4px;"><i class="fa-solid fa-check"></i></span>`) : ''}
    <div class="reaction-toolbar">
      <button type="button" class="btn-reaction-message" title="Réagir à ce message">😊</button>
      <div class="reaction-picker cache">
        <button type="button" class="reaction-option" data-emoji="👍">👍</button>
        <button type="button" class="reaction-option" data-emoji="😂">😂</button>
        <button type="button" class="reaction-option" data-emoji="❤️">❤️</button>
        <button type="button" class="reaction-option" data-emoji="🎉">🎉</button>
        <button type="button" class="reaction-option" data-emoji="😮">😮</button>
        <button type="button" class="reaction-option" data-emoji="😢">😢</button>
        <button type="button" class="reaction-option" data-emoji="👏">👏</button>
      </div>
    </div>
    <div class="reactions"></div>
  `;

  fil.appendChild(div);
  fil.scrollTop = fil.scrollHeight;
}

function accuserReceptionSiVisible(message) {
  const userActuel = utilisateur();
  const expediteurId = message.expediteur_id || message.sender_id;
  if (userActuel && expediteurId && String(expediteurId) !== String(userActuel.id) && socket) {
    socket.emit('message:lu', { messageId: message.id, expediteurId, ticketId: message.ticket_id });
  }
}

function mettreAJourStatutMessage(messageId, statut, lecteurId) {
  const bulle = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!bulle) return;
  let accuse = bulle.querySelector('.accuse');
  if (!accuse) {
    accuse = document.createElement('span');
    accuse.className = 'accuse';
    accuse.dataset.lu = 'false';
    bulle.appendChild(accuse);
  }

  // Applique l'état visuel : 'pending' -> simple coche grise, 'lu' -> double coche bleue
  if (statut === 'lu') {
    accuse.classList.remove('pending');
    accuse.classList.add('read');
    accuse.dataset.lu = 'true';
    accuse.innerHTML = '<i class="fa-solid fa-check-double"></i>';
  } else {
    accuse.classList.remove('read');
    accuse.classList.add('pending');
    accuse.dataset.lu = 'false';
    accuse.innerHTML = '<i class="fa-solid fa-check"></i>';
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
  zone.innerHTML = reactions
    .map(r => `<button type="button" class="reaction-chip" data-emoji="${r.emoji}">${r.emoji} ${r.count}</button>`)
    .join(' ');
}

function initialiserReactionsMessage() {
  const fil = document.getElementById('fil-messages');
  if (!fil) return;

  fil.addEventListener('click', (e) => {
    if (ticketActifDonnees?.statut === 'ferme') return;

    const reactionButton = e.target.closest('.btn-reaction-message');
    if (reactionButton) {
      const bulle = reactionButton.closest('.bulle-message');
      if (!bulle) return;

      const picker = bulle.querySelector('.reaction-picker');
      if (!picker) return;

      document.querySelectorAll('.reaction-picker').forEach((p) => {
        if (p !== picker) p.classList.add('cache');
      });
      picker.classList.toggle('cache');
      return;
    }

    const option = e.target.closest('.reaction-option');
    if (option) {
      if (ticketActifDonnees?.statut === 'ferme') return;
      const bulle = option.closest('.bulle-message');
      const messageId = bulle?.dataset.messageId;
      const emoji = option.dataset.emoji;
      if (socket && socket.connected && ticketActifId && messageId && emoji) {
        socket.emit('reaction:toggle', { messageId, emoji, ticketId: ticketActifId });
      }
      bulle?.querySelector('.reaction-picker')?.classList.add('cache');
      return;
    }

    const chip = e.target.closest('.reaction-chip');
    if (chip) {
      const bulle = chip.closest('.bulle-message');
      const messageId = bulle?.dataset.messageId;
      const emoji = chip.dataset.emoji;
      if (socket && socket.connected && ticketActifId && messageId && emoji) {
        socket.emit('reaction:toggle', { messageId, emoji, ticketId: ticketActifId });
      }
      return;
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bulle-message')) {
      document.querySelectorAll('.reaction-picker').forEach((picker) => picker.classList.add('cache'));
    }
  });
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
      if (ticketActifDonnees?.statut === 'ferme') {
        alert('Ce ticket est fermé, la conversation est close.');
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
      if (ticketActifDonnees?.statut === 'ferme') {
        alert("Ce ticket est fermé, impossible d'ajouter un fichier.");
        inputFichier.value = '';
        return;
      }

      const fichier = inputFichier.files[0];
      const formData = new FormData();
      formData.append('fichier', fichier);

      try {
        // La route backend est POST /api/tickets/:id/fichier (singulier) et
        // diffuse déjà elle-même "message:nouveau" / "fichier:partager" via
        // Socket.IO une fois le fichier enregistré : pas besoin (et surtout
        // pas correct) de ré-émettre "message:envoyer" en plus, ça créerait
        // un message en double dans la conversation.
        const res = await fetch(`/api/tickets/${ticketActifId}/fichier`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token()}` },
          body: formData
        });

        if (!res.ok) {
          let detail = '';
          try { detail = (await res.json()).message || ''; } catch (e) { /* pas de JSON */ }
          alert(`Erreur lors de l'envoi du fichier${detail ? ' : ' + detail : '.'}`);
        }
        // En cas de succès, l'affichage du message se fait via l'écouteur
        // socket "message:nouveau" déjà branché, comme pour un message texte.
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
// 7. ÉCOUTEURS D'ÉVÉNEMENTS DES BOUTONS D'APPELS TÉLÉCOM & PRISE EN CHARGE
// =========================================================================
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-appel-video')) {
    if (!ticketActifId) return alert("Veuillez d'abord sélectionner un ticket actif.");
    if (!window.ticketActifAutrePartieId) return alert("Impossible d'appeler : aucun agent n'a encore pris en charge ce ticket.");
    afficherInterfaceAppel("Démarrage de l'appel visio...", true);
    if (typeof window.demarrerAppel === 'function') window.demarrerAppel(ticketActifId, 'video');
  }

  if (e.target.closest('#btn-appel-audio')) {
    if (!ticketActifId) return alert("Veuillez d'abord sélectionner un ticket actif.");
    if (!window.ticketActifAutrePartieId) return alert("Impossible d'appeler : aucun agent n'a encore pris en charge ce ticket.");
    afficherInterfaceAppel("Démarrage de l'appel audio...", false);
    if (typeof window.demarrerAppel === 'function') window.demarrerAppel(ticketActifId, 'audio');
  }

  if (e.target.closest('#btn-raccrocher')) {
    masquerInterfaceAppel();
    if (typeof window.terminerAppel === 'function') window.terminerAppel();
  }

  if (e.target.closest('#btn-fermer-ticket')) {
    if (!ticketActifId) {
      return alert('Veuillez sélectionner un ticket avant de le fermer.');
    }
    (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketActifId}/statut`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({ statut: 'ferme' }),
        });
        const data = await res.json();
        if (!res.ok) {
          return alert(data.message || 'Impossible de fermer le ticket.');
        }

        ticketActifDonnees = data;
        rafraichirTicket(data);
        mettreAJourEtatPriseEnCharge(data);

        const statutEl = document.getElementById('statut-ticket');
        if (statutEl) {
          statutEl.textContent = data.statut;
          statutEl.className = `badge-statut ${data.statut}`;
        }

        alert('Le ticket a été fermé avec succès.');
      } catch (err) {
        console.error('Erreur fermeture du ticket :', err);
        alert('Erreur lors de la fermeture du ticket.');
      }
    })();
  }

  if (e.target.closest('#btn-retour-liste-mobile')) {
    const corpsApp = document.querySelector('.corps-app');
    if (corpsApp) corpsApp.classList.remove('ticket-ouvert-mobile');
    const chatVide = document.getElementById('chat-vide');
    const chatActif = document.getElementById('chat-actif');
    if (chatActif) chatActif.classList.add('cache');
    if (chatVide) chatVide.classList.remove('cache');
  }

  // Prise en charge exclusive d'un ticket par un agent/admin.
  if (e.target.closest('#btn-assigner-ticket')) {
    (async () => {
      if (!ticketActifId) return;
      try {
        const res = await fetch(`/api/tickets/${ticketActifId}/assigner`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token()}` },
        });
        const data = await res.json();
        if (res.ok) {
          ticketActifDonnees = data;
          mettreAJourEtatPriseEnCharge(data);
          rafraichirTicket(data);
        } else if (res.status === 409) {
          alert(data.message || 'Ce ticket est déjà pris en charge par un autre agent.');
          mettreAJourEtatPriseEnCharge({ ...ticketActifDonnees, agent_id: -1 });
        } else {
          alert(data.message || 'Impossible de prendre en charge ce ticket.');
        }
      } catch (err) {
        console.error('Erreur prise en charge du ticket :', err);
      }
    })();
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
    initialiserFiltreTickets();
    chargerTickets();
    initialiserFormulaireMessage();
    initialiserReactionsMessage();

    if (user.role && user.role.toLowerCase() === 'admin') {
      if (typeof chargerVraisClients === 'function') chargerVraisClients();
    }
  }
});