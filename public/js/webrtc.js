let peer = null;
let connexionMedia = null;
let streamLocal = null;
let appelEnCours = null;
let chronoInterval = null;

function initPeer() {
  peer = new Peer(); // Utilise le serveur PeerJS public par défaut

  peer.on('open', (id) => {
    window.monPeerId = id;
  });
}
initPeer();

async function demarrerAppel(destinataireId, ticketId, type) {
  streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
  afficherVideoLocale(streamLocal);
  socket.emit('appel:initier', { ticketId, destinataireId, type, peerId: window.monPeerId });
  ouvrirInterfaceAppel();
}

const btnAppelAudio = document.getElementById('btn-appel-audio');
if (btnAppelAudio) {
  btnAppelAudio.addEventListener('click', () => {
    if (ticketActifId) demarrerAppel(idAutrePartieDuTicket(), ticketActifId, 'audio');
  });
}

const btnAppelVideo = document.getElementById('btn-appel-video');
if (btnAppelVideo) {
  btnAppelVideo.addEventListener('click', () => {
    if (ticketActifId) demarrerAppel(idAutrePartieDuTicket(), ticketActifId, 'video');
  });
}

function idAutrePartieDuTicket() {
  return window.ticketActifAutrePartieId;
}

window.gererAppelEntrant = function ({ appelId, initiateur, peerIdInitiateur, type }) {
  appelEnCours = { appelId, autrePartieId: initiateur.id, peerIdDistant: peerIdInitiateur };
  
  const texteAppelEntrant = document.getElementById('texte-appel-entrant');
  if (texteAppelEntrant) texteAppelEntrant.textContent = `Appel ${type} de ${initiateur.nom}`;
  
  const modaleAppelEntrant = document.getElementById('modale-appel-entrant');
  if (modaleAppelEntrant) modaleAppelEntrant.classList.remove('cache');

  const btnAccepterAppel = document.getElementById('btn-accepter-appel');
  if (btnAccepterAppel) {
    btnAccepterAppel.onclick = async () => {
      streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      afficherVideoLocale(streamLocal);
      socket.emit('appel:accepter', { appelId, initiateurId: initiateur.id, peerId: window.monPeerId });
      if (modaleAppelEntrant) modaleAppelEntrant.classList.add('cache');
      ouvrirInterfaceAppel();

      peer.on('call', (appelEntrant) => {
        appelEntrant.answer(streamLocal);
        appelEntrant.on('stream', afficherVideoDistante);
        connexionMedia = appelEntrant;
      });
    };
  }

  const btnRefuserAppel = document.getElementById('btn-refuser-appel');
  if (btnRefuserAppel) {
    btnRefuserAppel.onclick = () => {
      socket.emit('appel:refuser', { appelId, initiateurId: initiateur.id });
      if (modaleAppelEntrant) modaleAppelEntrant.classList.add('cache');
    };
  }
};

window.gererAppelAccepte = function ({ appelId, peerId }) {
  connexionMedia = peer.call(peerId, streamLocal);
  connexionMedia.on('stream', afficherVideoDistante);
  appelEnCours = { ...appelEnCours, appelId };
  demarrerChrono();
};

window.gererAppelRefuse = function () {
  fermerInterfaceAppel();
  alert("L'appel a été refusé.");
};

window.gererAppelTermine = function () {
  fermerInterfaceAppel();
};

function afficherVideoLocale(stream) { 
  const videoLocale = document.getElementById('video-locale');
  if (videoLocale) videoLocale.srcObject = stream; 
}

function afficherVideoDistante(stream) {
  const videoDistante = document.getElementById('video-distante');
  if (videoDistante) videoDistante.srcObject = stream;
  demarrerChrono();
}

function ouvrirInterfaceAppel() { 
  const interfaceAppel = document.getElementById('interface-appel');
  if (interfaceAppel) interfaceAppel.classList.remove('cache'); 
}

function fermerInterfaceAppel() {
  const interfaceAppel = document.getElementById('interface-appel');
  if (interfaceAppel) interfaceAppel.classList.add('cache');
  clearInterval(chronoInterval);
  
  const chronoAppel = document.getElementById('chrono-appel');
  if (chronoAppel) chronoAppel.textContent = '00:00';

  if (streamLocal) streamLocal.getTracks().forEach((t) => t.stop());
  if (connexionMedia) connexionMedia.close();
}

function demarrerChrono() {
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

const btnToggleMicro = document.getElementById('btn-toggle-micro');
if (btnToggleMicro) {
  btnToggleMicro.addEventListener('click', () => {
    if (!streamLocal) return;
    const piste = streamLocal.getAudioTracks()[0];
    if (piste) {
      piste.enabled = !piste.enabled;
      socket.emit('appel:controle', { ticketId: ticketActifId, micro: !piste.enabled });
    }
  });
}

const btnToggleCamera = document.getElementById('btn-toggle-camera');
if (btnToggleCamera) {
  btnToggleCamera.addEventListener('click', () => {
    if (!streamLocal) return;
    const piste = streamLocal.getVideoTracks()[0];
    if (!piste) return;
    piste.enabled = !piste.enabled;
    socket.emit('appel:controle', { ticketId: ticketActifId, video: !piste.enabled });
  });
}

const btnPartageEcran = document.getElementById('btn-partage-ecran');
if (btnPartageEcran) {
  btnPartageEcran.addEventListener('click', async () => {
    if (!connexionMedia) return;
    const streamEcran = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
    const pisteEcran = streamEcran.getVideoTracks()[0];

    const sender = connexionMedia.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      await sender.replaceTrack(pisteEcran);
      socket.emit('appel:controle', { ticketId: ticketActifId, partageEcran: true });

      pisteEcran.onended = async () => {
        const streamCamera = await navigator.mediaDevices.getUserMedia({ video: true });
        await sender.replaceTrack(streamCamera.getVideoTracks()[0]);
        socket.emit('appel:controle', { ticketId: ticketActifId, partageEcran: false });
      };
    }
  });
}

window.gererControleDistant = function ({ micro, video, partageEcran }) {
  // TODO : afficher les icônes 🔇 / 📷 OFF sur la vidéo distante selon ces booléens
};

const btnRaccrocher = document.getElementById('btn-raccrocher');
if (btnRaccrocher) {
  btnRaccrocher.addEventListener('click', () => {
    if (appelEnCours) {
      socket.emit('appel:terminer', {
        appelId: appelEnCours.appelId,
        dureeSecondes: appelEnCours.dureeSecondes || 0,
        autrePartieId: appelEnCours.autrePartieId,
      });
    }
    fermerInterfaceAppel();
  });
}