// =========================================================================
// GESTION WEBRTC (PeerJS & MediaStreams)
// =========================================================================

let peer = null;
let connexionMedia = null;
let streamLocal = null;
let appelEnCours = null;
let chronoInterval = null;
let partageEcranActif = false;
let streamPartageEcran = null;

// 1. INITIALISATION DE PEERJS
function initPeer() {
  const host = window.location.hostname || 'localhost';
  const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
  const secure = window.location.protocol === 'https:';

  peer = new Peer(undefined, {
    host,
    port,
    path: '/peerjs',
    secure,
    debug: 2,
  });

  peer.on('open', (id) => {
    console.log('[WebRTC] Mon Peer ID est :', id);
    window.monPeerId = id;
  });

  peer.on('error', (err) => {
    console.error('[WebRTC] Erreur PeerJS :', err);
  });
}
initPeer();

// 2. RECUPERATION ET AFFICHAGE DES MEDIAS
async function obtenirFluxMedia(type = 'video') {
  try {
    const contraintes = {
      audio: true,
      video: type === 'video'
    };

    const stream = await navigator.mediaDevices.getUserMedia(contraintes);
    streamLocal = stream;

    // Affichage uniquement si l'appel comporte de la vidéo
    if (type === 'video') {
      afficherVideoLocale(stream);
    }

    return stream;
  } catch (err) {
    console.error("[WebRTC] Erreur d'accès aux périphériques media :", err);
    alert("Impossible d'accéder à la caméra ou au microphone. Vérifiez les autorisations de votre navigateur.");
    throw err;
  }
}

function afficherVideoLocale(stream) { 
  const videoLocale = document.getElementById('video-locale');
  if (videoLocale) {
    videoLocale.srcObject = stream;
    videoLocale.muted = true; // Évite l'écho local
    videoLocale.play().catch(e => console.warn("[WebRTC] Lecture vidéo locale bloquée :", e));
  }
}

function afficherVideoDistante(stream) {
  const videoDistante = document.getElementById('video-distante');
  if (videoDistante) {
    videoDistante.srcObject = stream;
    videoDistante.play().catch(e => console.warn("[WebRTC] Lecture vidéo distante bloquée :", e));
  }
  demarrerChrono();
}

// 3. GESTION DE L'INTERFACE GRAPHIQUE D'APPEL
function ouvrirInterfaceAppel(type = 'video') { 
  const modal = document.getElementById('modal-appel') || document.getElementById('interface-appel');
  const containerVideo = document.getElementById('container-flux-video');
  const interfaceAudio = document.getElementById('interface-audio-uniquement');
  const btnCam = document.getElementById('btn-couper-cam') || document.getElementById('btn-toggle-camera');

  if (modal) {
    modal.classList.remove('cache');
    modal.style.display = 'flex';
  }

  // Adaptation de la modale en fonction du type d'appel (Audio vs Vidéo)
  const btnPartage = document.getElementById('btn-partage-ecran');
  const btnArreter = document.getElementById('btn-arreter-partage');
  const btnReaction = document.getElementById('btn-reaction-appel');

  if (type === 'video') {
    if (containerVideo) containerVideo.style.display = 'flex';
    if (interfaceAudio) interfaceAudio.style.display = 'none';
    if (btnCam) btnCam.style.display = 'inline-flex';
    if (btnPartage) btnPartage.style.display = 'inline-flex';
    if (btnReaction) btnReaction.style.display = 'inline-flex';
    if (btnArreter) btnArreter.style.display = 'none';
  } else {
    if (containerVideo) containerVideo.style.display = 'none';
    if (interfaceAudio) interfaceAudio.style.display = 'flex';
    if (btnCam) btnCam.style.display = 'none';
    if (btnPartage) btnPartage.style.display = 'none';
    if (btnArreter) btnArreter.style.display = 'none';
    if (btnReaction) btnReaction.style.display = 'inline-flex';
  }
}

function fermerInterfaceAppel() {
  const modal = document.getElementById('modal-appel') || document.getElementById('interface-appel');
  if (modal) {
    modal.classList.add('cache');
    modal.style.display = 'none';
  }
  
  clearInterval(chronoInterval);
  
  const chronoAppel = document.getElementById('chrono-appel');
  if (chronoAppel) chronoAppel.textContent = '00:00';

  // Libération des caméras et micros
  if (streamLocal) {
    streamLocal.getTracks().forEach((track) => track.stop());
    streamLocal = null;
  }

  if (streamPartageEcran) {
    streamPartageEcran.getTracks().forEach((track) => track.stop());
    streamPartageEcran = null;
  }
  
  if (connexionMedia) {
    connexionMedia.close();
    connexionMedia = null;
  }

  const btnArreter = document.getElementById('btn-arreter-partage');
  if (btnArreter) btnArreter.classList.add('cache');

  appelEnCours = null;
}

// 4. CHRONOMÈTRE
function demarrerChrono() {
  if (chronoInterval) clearInterval(chronoInterval);
  
  const debut = Date.now();
  chronoInterval = setInterval(() => {
    const secondes = Math.floor((Date.now() - debut) / 1000);
    const mm = String(Math.floor(secondes / 60)).padStart(2, '0');
    const ss = String(secondes % 60).padStart(2, '0');
    
    const chronoAppel = document.getElementById('chrono-appel');
    if (chronoAppel) chronoAppel.textContent = `${mm}:${ss}`;
    
    if (appelEnCours) appelEnCours.dureeSecondes = secondes;
  }, 1000);
}

// 5. INITIATION ET RÉCEPTION DE L'APPEL
async function demarrerAppel(ticketId, type = 'video') {
  try {
    await obtenirFluxMedia(type);
    ouvrirInterfaceAppel(type);

    appelEnCours = {
      ticketId,
      type,
      autrePartieId: idAutrePartieDuTicket(),
      dureeSecondes: 0,
    };

    const destinataireId = idAutrePartieDuTicket();
    socket.emit('appel:initier', { ticketId, destinataireId, type, peerId: window.monPeerId });
  } catch (err) {
    fermerInterfaceAppel();
  }
}

function idAutrePartieDuTicket() {
  return window.ticketActifAutrePartieId;
}

// Global Handlers pour Sockets / Événements
window.gererAppelEntrant = function ({ appelId, initiateur, peerIdInitiateur, type }) {
  // ⚠️ CORRIGÉ : ticketId manquait ici. Sans lui, quand c'est la personne qui
  // RÉPOND à l'appel qui raccroche en premier, l'événement "appel:terminer"
  // partait avec ticketId undefined → la diffusion via la room ticket:{id}
  // échouait côté serveur, l'autre participant n'était pas notifié de façon fiable.
  appelEnCours = {
    appelId,
    autrePartieId: initiateur.id,
    peerIdDistant: peerIdInitiateur,
    type,
    ticketId: window.ticketActifId,
  };
  
  const texteAppelEntrant = document.getElementById('texte-appel-entrant');
  if (texteAppelEntrant) texteAppelEntrant.textContent = `Appel ${type === 'video' ? 'vidéo' : 'audio'} de ${initiateur.nom || 'un utilisateur'}`;
  
  const modaleAppelEntrant = document.getElementById('modale-appel-entrant');
  if (modaleAppelEntrant) {
    modaleAppelEntrant.classList.remove('cache');
    modaleAppelEntrant.style.display = 'flex';
  }

  function fermerSonnerie() {
    if (modaleAppelEntrant) {
      modaleAppelEntrant.classList.add('cache');
      modaleAppelEntrant.style.display = 'none';
    }
  }

  const btnAccepterAppel = document.getElementById('btn-accepter-appel');
  if (btnAccepterAppel) {
    btnAccepterAppel.onclick = async () => {
      try {
        await obtenirFluxMedia(type);
        socket.emit('appel:accepter', { appelId, initiateurId: initiateur.id, peerId: window.monPeerId });
        
        fermerSonnerie();
        ouvrirInterfaceAppel(type);

        peer.on('call', (appelEntrant) => {
          appelEntrant.answer(streamLocal);
          appelEntrant.on('stream', afficherVideoDistante);
          connexionMedia = appelEntrant;
        });
      } catch (e) {
        console.error("Échec lors de l'acceptation de l'appel:", e);
      }
    };
  }

  const btnRefuserAppel = document.getElementById('btn-refuser-appel');
  if (btnRefuserAppel) {
    btnRefuserAppel.onclick = () => {
      socket.emit('appel:refuser', { appelId, initiateurId: initiateur.id });
      fermerSonnerie();
    };
  }
};

window.gererAppelAccepte = function ({ appelId, peerId }) {
  if (!peer || !streamLocal) return;

  connexionMedia = peer.call(peerId, streamLocal);
  connexionMedia.on('stream', afficherVideoDistante);
  appelEnCours = { ...appelEnCours, appelId };
  demarrerChrono();
};

window.gererAppelRefuse = function () {
  fermerInterfaceAppel();
  alert("L'appel a été refusé par votre correspondant.");
};

window.gererAppelTermine = function () {
  fermerInterfaceAppel();
  appelEnCours = null;
};

window.terminerAppel = function() {
  if (appelEnCours && typeof socket !== 'undefined') {
    socket.emit('appel:terminer', {
      appelId: appelEnCours.appelId,
      dureeSecondes: appelEnCours.dureeSecondes || 0,
      autrePartieId: appelEnCours.autrePartieId,
      ticketId: appelEnCours.ticketId,
    });
  }
  fermerInterfaceAppel();
};

// Exposer la fonction globale pour app.js
window.demarrerAppel = demarrerAppel;

// 6. DÉLÉGATION ET CONTRÔLE PÉRIPHÉRIQUES (Micro / Caméra / Partage)
document.addEventListener('click', (e) => {
  // Couper / Réactiver Micro
  const btnMic = e.target.closest('#btn-couper-mic') || e.target.closest('#btn-toggle-micro');
  if (btnMic) {
    if (!streamLocal) return;
    const pisteAudio = streamLocal.getAudioTracks()[0];
    if (pisteAudio) {
      pisteAudio.enabled = !pisteAudio.enabled;
      btnMic.style.background = pisteAudio.enabled ? '#334155' : '#ef4444';
      if (typeof socket !== 'undefined') {
        socket.emit('appel:controle', { ticketId: window.ticketActifId, micro: pisteAudio.enabled });
      }
    }
  }

  // Couper / Réactiver Caméra
  const btnCam = e.target.closest('#btn-couper-cam') || e.target.closest('#btn-toggle-camera');
  if (btnCam) {
    if (!streamLocal) return;
    const pisteVideo = streamLocal.getVideoTracks()[0];
    if (pisteVideo) {
      pisteVideo.enabled = !pisteVideo.enabled;
      btnCam.style.background = pisteVideo.enabled ? '#334155' : '#ef4444';
      if (typeof socket !== 'undefined') {
        socket.emit('appel:controle', { ticketId: window.ticketActifId, video: pisteVideo.enabled });
      }
    }
  }

  const btnPartage = e.target.closest('#btn-partage-ecran');
  const btnArreterPartage = e.target.closest('#btn-arreter-partage');
  const btnReaction = e.target.closest('#btn-reaction-appel');

  if (btnPartage) {
    if (!connexionMedia) return;
    const indicateur = document.getElementById('indicateur-partage-ecran');
    const btnArreter = document.getElementById('btn-arreter-partage');
    (async () => {
      try {
        const streamEcran = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
        const pisteEcran = streamEcran.getVideoTracks()[0];
        streamPartageEcran = streamEcran;

        const sender = connexionMedia.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(pisteEcran);
          partageEcranActif = true;
          btnPartage.style.background = '#22c55e';
          if (btnArreter) btnArreter.classList.remove('cache');
          if (indicateur) indicateur.classList.remove('cache');
          if (typeof socket !== 'undefined') {
            socket.emit('appel:controle', { ticketId: window.ticketActifId, partageEcran: true });
          }

          pisteEcran.onended = () => {
            arreterPartageEcran(sender, btnPartage, btnArreter, indicateur);
          };
        }
      } catch (err) {
        console.warn('[WebRTC] Partage d\'écran annulé ou refusé.', err);
      }
    })();
  }

  if (btnArreterPartage) {
    if (!connexionMedia) return;
    const indicateur = document.getElementById('indicateur-partage-ecran');
    const btnPartageEl = document.getElementById('btn-partage-ecran');
    const sender = connexionMedia.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      arreterPartageEcran(sender, btnPartageEl, btnArreterPartage, indicateur);
    }
  }

  if (btnReaction) {
    const zoneReactions = document.getElementById('appel-reactions');
    if (zoneReactions) {
      zoneReactions.classList.toggle('cache');
    }
  }

  if (e.target.closest('.reaction-emoji')) {
    const emoji = e.target.closest('.reaction-emoji').dataset.emoji;
    if (emoji && appelEnCours && socket) {
      socket.emit('appel:reaction', {
        appelId: appelEnCours.appelId,
        emoji,
        autrePartieId: appelEnCours.autrePartieId,
      });
      afficherReactionLocale(emoji);
    }
  }

  // Raccrocher
  const btnRaccrocher = e.target.closest('#btn-raccrocher');
  if (btnRaccrocher) {
    window.terminerAppel();
  }
});

window.gererControleDistant = function ({ micro, video, partageEcran }) {
  // Icônes visuelles côté distant, conformément au cahier des charges
  // (🔇 micro coupé, 📷 OFF caméra coupée, écran partagé actif).
  const conteneurVideo = document.getElementById('container-flux-video');
  if (!conteneurVideo) return;

  let badge = document.getElementById('badge-etat-distant');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'badge-etat-distant';
    badge.style.cssText = 'position:absolute; top:10px; left:10px; display:flex; gap:0.4rem; z-index:2;';
    conteneurVideo.appendChild(badge);
  }

  const icones = [];
  if (micro === false) icones.push('<span style="background:#ef4444;color:#fff;padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;">🔇</span>');
  if (video === false) icones.push('<span style="background:#ef4444;color:#fff;padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;">📷 OFF</span>');
  if (partageEcran === true) icones.push('<span style="background:#22c55e;color:#fff;padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;"><i class="fa-solid fa-display"></i> Écran partagé</span>');
  badge.innerHTML = icones.join('');
};

window.gererAppelReaction = function ({ emoji, de }) {
  const reactionDisplay = document.getElementById('appel-reaction-display');
  if (!reactionDisplay) return;
  reactionDisplay.classList.remove('cache');
  reactionDisplay.textContent = `${de?.nom || 'Votre correspondant'} a envoyé ${emoji}`;
  setTimeout(() => {
    reactionDisplay.classList.add('cache');
  }, 4000);
};

function afficherReactionLocale(emoji) {
  const reactionDisplay = document.getElementById('appel-reaction-display');
  if (!reactionDisplay) return;
  reactionDisplay.classList.remove('cache');
  reactionDisplay.textContent = `Vous avez envoyé ${emoji}`;
  setTimeout(() => {
    reactionDisplay.classList.add('cache');
  }, 2500);
}

async function arreterPartageEcran(sender, btnPartageEl, btnArreterEl, indicateur) {
  if (streamPartageEcran) {
    streamPartageEcran.getTracks().forEach((track) => track.stop());
    streamPartageEcran = null;
  }

  if (!connexionMedia) return;
  if (sender) {
    try {
      const streamCamera = await navigator.mediaDevices.getUserMedia({ video: true });
      const pisteCamera = streamCamera.getVideoTracks()[0];
      await sender.replaceTrack(pisteCamera);
      if (streamLocal) {
        streamLocal.getTracks().forEach((track) => track.stop());
      }
      streamLocal = streamCamera;
      afficherVideoLocale(streamLocal);
    } catch (err) {
      console.warn('[WebRTC] Impossible de restaurer la caméra après arrêt du partage.', err);
    }
  }

  partageEcranActif = false;
  if (btnPartageEl) btnPartageEl.style.background = '#334155';
  if (btnArreterEl) btnArreterEl.classList.add('cache');
  if (indicateur) indicateur.classList.add('cache');
  if (typeof socket !== 'undefined') {
    socket.emit('appel:controle', { ticketId: window.ticketActifId, partageEcran: false });
  }
}
