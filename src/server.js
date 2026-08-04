const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/auth');
const clientsRoutes = require('./routes/clients');
const forfaitsRoutes = require('./routes/forfaits');
const facturesRoutes = require('./routes/factures');
const ticketsRoutes = require('./routes/tickets');
const statsRoutes = require('./routes/stats');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configuration ExpressPeerServer (Auto-hébergé sur le port 3000)
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});
app.use('/peerjs', peerServer);

// Documentation Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/forfaits', forfaitsRoutes);
app.use('/api/factures', facturesRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/stats', statsRoutes);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Serveur Senegal-Connect démarré sur le port ${PORT}`);
    console.log(`Documentation Swagger disponible sur http://localhost:${PORT}/api-docs`);
  });
}

module.exports = { app, server };