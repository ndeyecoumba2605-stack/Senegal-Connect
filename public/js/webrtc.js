// =========================================================================
// GESTION WEBRTC (PeerJS & MediaStreams)
// =========================================================================

let peer = null;
let connexionMedia = null;
let streamLocal = null;
let appelEnCours = null;
let chronoInterval = null;

// 1. INITIALISATION DE PEERJS
function initPeer() {
  // Utilise le serveur PeerJS public par défaut
  peer = new Peer();

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
  if (type === 'video') {
    if (containerVideo) containerVideo.style.display = 'flex';
    if (interfaceAudio) interfaceAudio.style.display = 'none';
    if (btnCam) btnCam.style.display = 'inline-flex';
  } else {
    if (containerVideo) containerVideo.style.display = 'none';
    if (interfaceAudio) interfaceAudio.style.display = 'flex';
    if (btnCam) btnCam.style.display = 'none';
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
  
  if (connexionMedia) {
    connexionMedia.close();
    connexionMedia = null;
  }

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
  appelEnCours = { appelId, autrePartieId: initiateur.id, peerIdDistant: peerIdInitiateur, type };
  
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
};

window.terminerAppel = function() {
  if (appelEnCours && typeof socket !== 'undefined') {
    socket.emit('appel:terminer', {
      appelId: appelEnCours.appelId,
      dureeSecondes: appelEnCours.dureeSecondes || 0,
      autrePartieId: appelEnCours.autrePartieId,
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

  // Partage d'écran
  const btnPartage = e.target.closest('#btn-partage-ecran');
  if (btnPartage) {
    (async () => {
      if (!connexionMedia) return;
      const indicateur = document.getElementById('indicateur-partage-ecran');
      try {
        const streamEcran = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
        const pisteEcran = streamEcran.getVideoTracks()[0];

        const sender = connexionMedia.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(pisteEcran);
          btnPartage.style.background = '#22c55e';
          if (indicateur) indicateur.classList.remove('cache');
          if (typeof socket !== 'undefined') {
            socket.emit('appel:controle', { ticketId: window.ticketActifId, partageEcran: true });
          }

          pisteEcran.onended = async () => {
            const streamCamera = await navigator.mediaDevices.getUserMedia({ video: true });
            await sender.replaceTrack(streamCamera.getVideoTracks()[0]);
            btnPartage.style.background = '#334155';
            if (indicateur) indicateur.classList.add('cache');
            if (typeof socket !== 'undefined') {
              socket.emit('appel:controle', { ticketId: window.ticketActifId, partageEcran: false });
            }
          };
        }
      } catch (err) {
        console.warn("[WebRTC] Partage d'écran annulé ou refusé.");
      }
    })();
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