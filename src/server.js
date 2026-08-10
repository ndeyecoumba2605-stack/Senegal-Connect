require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');

const logger = require('./config/logger');
const { gestionnaire404, gestionnaireErreurs } = require('./middleware/erreurs');
const swaggerSpec = require('./config/swagger');
const swaggerUi = require('swagger-ui-express');

const app = express();
const server = http.createServer(app);

// 🛠️ FIX CORS & TRANSPORTS :
// '*' est incompatible avec credentials:true (rejeté par les navigateurs).
// On retombe sur une origine locale explicite si CORS_ORIGINS n'est pas défini.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000'];

const io = new Server(server, { 
  cors: { 
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'] // Permet la négociation propre HTTP -> WS
});

// IMPORTANT : permet à req.app.get('io') de fonctionner dans les routes
app.set('io', io);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use((req, res, next) => {
  // En développement, on désactive systématiquement le cache navigateur sur
  // TOUS les fichiers servis statiquement (HTML, JS, CSS) : express.static
  // ne fixe pas de Cache-Control par défaut, mais les navigateurs mettent
  // quand même souvent en cache agressive les .js/.css sans revalidation
  // explicite lors d'un simple rechargement — ce qui fait exécuter une
  // ancienne version du code après une mise à jour des fichiers, sans
  // qu'aucune erreur ne le signale. no-store force une requête réseau
  // fraîche à chaque chargement de page.
  if (/\.(html|js|css)$/.test(req.path) || req.path === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

app.use(morgan('combined', { stream: logger.stream }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Routes API & Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/forfaits', require('./routes/forfaits'));
app.use('/api/factures', require('./routes/factures'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/utilisateurs', require('./routes/utilisateurs'));
app.get('/api/health', (req, res) =>
  res.json({ statut: 'ok', version: '1.0.0', uptime: process.uptime(), env: process.env.NODE_ENV })
);

// WebSockets (Support & Appels)
require('./socket/support')(io);
require('./socket/appels')(io);

// Server PeerJS pour la visio/voix
if (process.env.NODE_ENV !== 'test') {
  const peerServer = ExpressPeerServer(server, {
    debug: process.env.NODE_ENV !== 'production',
    path: '/',
    allow_discovery: false,
  });

  app.use('/peerjs', peerServer);
}

// Tâches planifiées : facturation mensuelle automatique + passage en retard
if (process.env.NODE_ENV !== 'test') {
  const { demarrerTachesFacturation } = require('./jobs/facturation');
  demarrerTachesFacturation();
}

// Gestion des erreurs
app.use(gestionnaire404);
app.use(gestionnaireErreurs);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => logger.info(`Serveur démarré sur le port ${PORT}`));
}

module.exports = { app, server };