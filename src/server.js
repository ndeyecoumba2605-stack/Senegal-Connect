require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const { gestionnaire404 } = require('./middleware/erreurs');

const logger = require('./config/logger');
const { gestionnaireErreurs, routeInconnue } = require('./middleware/erreurs');
const swaggerSpec = require('./config/swagger');
const swaggerUi = require('swagger-ui-express');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGINS?.split(',') } });

// IMPORTANT : permet à req.app.get('io') de fonctionner dans les routes (ex: tickets.js)
app.set('io', io);

app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') }));
app.use(express.json());
app.use(morgan('combined', { stream: logger.stream }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/forfaits', require('./routes/forfaits'));
app.use('/api/factures', require('./routes/factures'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/stats', require('./routes/stats'));
app.get('/api/health', (req, res) =>
  res.json({ statut: 'ok', version: '1.0.0', uptime: process.uptime(), env: process.env.NODE_ENV })
);

require('./socket/support')(io);
require('./socket/appels')(io);

const peerServer = ExpressPeerServer(server, { path: '/peerjs' });
app.use('/peerjs', peerServer);

app.use(gestionnaire404);
app.use(gestionnaireErreurs);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => logger.info(`Serveur démarré sur le port ${PORT}`));
}

module.exports = { app, server };