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

document.getElementById('btn-appel-audio').addEventListener('click', () => {
  if (ticketActifId) demarrerAppel(idAutrePartieDuTicket(), ticketActifId, 'audio');
});
document.getElementById('btn-appel-video').addEventListener('click', () => {
  if (ticketActifId) demarrerAppel(idAutrePartieDuTicket(), ticketActifId, 'video');
});

function idAutrePartieDuTicket() {
  // TODO : récupérer l'agent_id ou client_id du ticket actif selon le rôle connecté
  return window.ticketActifAutrePartieId;
}

window.gererAppelEntrant = function ({ appelId, initiateur, peerIdInitiateur, type }) {
  appelEnCours = { appelId, autrePartieId: initiateur.id, peerIdDistant: peerIdInitiateur };
  document.getElementById('texte-appel-entrant').textContent = `Appel ${type} de ${initiateur.nom}`;
  document.getElementById('modale-appel-entrant').classList.remove('cache');

  document.getElementById('btn-accepter-appel').onclick = async () => {
    streamLocal = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    afficherVideoLocale(streamLocal);
    socket.emit('appel:accepter', { appelId, initiateurId: initiateur.id, peerId: window.monPeerId });
    document.getElementById('modale-appel-entrant').classList.add('cache');
    ouvrirInterfaceAppel();

    peer.on('call', (appelEntrant) => {
      appelEntrant.answer(streamLocal);
      appelEntrant.on('stream', afficherVideoDistante);
      connexionMedia = appelEntrant;
    });
  };

  document.getElementById('btn-refuser-appel').onclick = () => {
    socket.emit('appel:refuser', { appelId, initiateurId: initiateur.id });
    document.getElementById('modale-appel-entrant').classList.add('cache');
  };
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

function afficherVideoLocale(stream) { document.getElementById('video-locale').srcObject = stream; }
function afficherVideoDistante(stream) {
  document.getElementById('video-distante').srcObject = stream;
  demarrerChrono();
}

function ouvrirInterfaceAppel() { document.getElementById('interface-appel').classList.remove('cache'); }
function fermerInterfaceAppel() {
  document.getElementById('interface-appel').classList.add('cache');
  clearInterval(chronoInterval);
  document.getElementById('chrono-appel').textContent = '00:00';
  if (streamLocal) streamLocal.getTracks().forEach((t) => t.stop());
  if (connexionMedia) connexionMedia.close();
}

function demarrerChrono() {
  const debut = Date.now();
  chronoInterval = setInterval(() => {
    const secondes = Math.floor((Date.now() - debut) / 1000);
    const mm = String(Math.floor(secondes / 60)).padStart(2, '0');
    const ss = String(secondes % 60).padStart(2, '0');
    document.getElementById('chrono-appel').textContent = `${mm}:${ss}`;
    appelEnCours.dureeSecondes = secondes;
  }, 1000);
}

document.getElementById('btn-toggle-micro').addEventListener('click', () => {
  const piste = streamLocal.getAudioTracks()[0];
  piste.enabled = !piste.enabled;
  socket.emit('appel:controle', { ticketId: ticketActifId, micro: !piste.enabled });
});

document.getElementById('btn-toggle-camera').addEventListener('click', () => {
  const piste = streamLocal.getVideoTracks()[0];
  if (!piste) return;
  piste.enabled = !piste.enabled;
  socket.emit('appel:controle', { ticketId: ticketActifId, video: !piste.enabled });
});

document.getElementById('btn-partage-ecran').addEventListener('click', async () => {
  const streamEcran = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
  const pisteEcran = streamEcran.getVideoTracks()[0];

  const sender = connexionMedia.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
  await sender.replaceTrack(pisteEcran);
  socket.emit('appel:controle', { ticketId: ticketActifId, partageEcran: true });

  pisteEcran.onended = async () => {
    const streamCamera = await navigator.mediaDevices.getUserMedia({ video: true });
    await sender.replaceTrack(streamCamera.getVideoTracks()[0]);
    socket.emit('appel:controle', { ticketId: ticketActifId, partageEcran: false });
  };
});

window.gererControleDistant = function ({ micro, video, partageEcran }) {
  // TODO : afficher les icônes 🔇 / 📷 OFF sur la vidéo distante selon ces booléens
};

document.getElementById('btn-raccrocher').addEventListener('click', () => {
  if (appelEnCours) {
    socket.emit('appel:terminer', {
      appelId: appelEnCours.appelId,
      dureeSecondes: appelEnCours.dureeSecondes || 0,
      autrePartieId: appelEnCours.autrePartieId,
    });
  }
  fermerInterfaceAppel();
});