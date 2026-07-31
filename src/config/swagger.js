const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sénégal Connect API',
      version: '1.0.0',
      description: "API REST d'opérateur télécom — Polytech Diamniadio, UAM",
    },
    servers: [{ url: 'http://localhost:3000', description: 'Serveur local' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Client: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            msisdn: { type: 'string', example: '+221771234567' },
            nom: { type: 'string', example: 'Ndiaye' },
            prenom: { type: 'string', example: 'Awa' },
            email: { type: 'string', example: 'awa.ndiaye@senegalconnect.sn' },
            statut: { type: 'string', enum: ['actif', 'suspendu', 'resilie'] },
            forfait_id: { type: 'integer', example: 2 },
          },
        },
        Forfait: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 },
            nom: { type: 'string', example: 'Forfait Confort' },
            quota_data_go: { type: 'number', example: 10 },
            quota_voix_min: { type: 'integer', example: 300 },
            prix_mensuel_fcfa: { type: 'number', example: 8000 },
            actif: { type: 'boolean', example: true },
          },
        },
        Facture: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            reference: { type: 'string', example: 'FAC-202607-0001' },
            client_id: { type: 'integer', example: 1 },
            periode: { type: 'string', example: '2026-07' },
            montant_fcfa: { type: 'number', example: 8000 },
            statut: { type: 'string', enum: ['payee', 'impayee', 'en_retard'] },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 132 },
            page: { type: 'integer', example: 1 },
            limite: { type: 'integer', example: 20 },
            total_pages: { type: 'integer', example: 7 },
          },
        },
        Erreur: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Ressource introuvable' } },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
}

module.exports = { setupSwagger, swaggerSpec };
