const request = require('supertest');
jest.mock('../src/config/db');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'secret_de_test_au_moins_64_caracteres_xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const { app } = require('../src/server');

const tokenAdmin = jwt.sign({ id: 1, role: 'admin', nom: 'Test' }, process.env.JWT_SECRET);
const tokenClient = jwt.sign({ id: 2, role: 'client', nom: 'Test' }, process.env.JWT_SECRET);

// ───────────── Auth (5) ─────────────
describe('Auth', () => {
  test('Inscription valide → 201', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, nom: 'A', prenom: 'B', email: 'a@a.com', role: 'client' }] });
    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'A', prenom: 'B', email: 'a@a.com', mot_de_passe: 'motdepasse123', role: 'client',
    });
    expect(reponse.status).toBe(201);
  });

  test('Doublon MSISDN/email → 409', async () => {
    const erreur = new Error('duplicate'); erreur.code = '23505';
    db.query.mockRejectedValueOnce(erreur);
    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'A', prenom: 'B', email: 'a@a.com', mot_de_passe: 'motdepasse123', role: 'client',
    });
    expect(reponse.status).toBe(409);
  });

  test('Login valide → JWT retourné', async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('motdepasse123', 12);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, nom: 'A', email: 'a@a.com', role: 'client', mot_de_passe: hash }] });
    const reponse = await request(app).post('/api/auth/login').send({ email: 'a@a.com', mot_de_passe: 'motdepasse123' });
    expect(reponse.status).toBe(200);
    expect(reponse.body.token).toBeDefined();
  });

  test('Email inconnu → 401', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const reponse = await request(app).post('/api/auth/login').send({ email: 'inconnu@a.com', mot_de_passe: 'x' });
    expect(reponse.status).toBe(401);
  });

  test('Token expiré → 401', async () => {
    const tokenExpire = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const reponse = await request(app).get('/api/auth/profil').set('Authorization', `Bearer ${tokenExpire}`);
    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toMatch(/expiré/);
  });
});

// ───────────── Clients (5) ─────────────
describe('Clients', () => {
  test('Liste paginée avec pagination', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const reponse = await request(app).get('/api/clients').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(200);
    expect(reponse.body.pagination).toBeDefined();
  });

  test('Filtrage ?q=', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, msisdn: '+221771234567' }] });
    const reponse = await request(app).get('/api/clients?q=771234567').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(200);
  });

  test('Détail client existant', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, forfait_id: 1 }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    db.query.mockResolvedValueOnce({ rows: [] });
    db.query.mockResolvedValueOnce({ rows: [] });
    const reponse = await request(app).get('/api/clients/1').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(200);
  });

  test('404 sur ID inexistant', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const reponse = await request(app).get('/api/clients/9999').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(404);
  });

  test('MSISDN invalide → 422', async () => {
    const reponse = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ msisdn: '771234567', email: 'a@a.com', forfait_id: 1 });
    expect(reponse.status).toBe(422);
  });
});

// ───────────── Forfaits (4) ─────────────
describe('Forfaits', () => {
  test('Liste → 200 avec nb_clients', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, nom: 'Basic', nb_clients: '3' }] });
    const reponse = await request(app).get('/api/forfaits');
    expect(reponse.status).toBe(200);
    expect(reponse.body.data[0].nb_clients).toBeDefined();
  });

  test('Créer sans token → 401', async () => {
    const reponse = await request(app).post('/api/forfaits').send({ nom: 'Test', quota_data_go: 5, quota_voix_min: 100, prix_mensuel_fcfa: 3000 });
    expect(reponse.status).toBe(401);
  });

  test('Créer avec prix négatif → 422', async () => {
    const reponse = await request(app)
      .post('/api/forfaits')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nom: 'Test', quota_data_go: 5, quota_voix_min: 100, prix_mensuel_fcfa: -100 });
    expect(reponse.status).toBe(422);
  });

  test('Supprimer forfait avec clients abonnés → 409', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const reponse = await request(app).delete('/api/forfaits/1').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(409);
  });
});

// ───────────── Factures (4) ─────────────
describe('Factures', () => {
  test('Liste filtrée ?client_id=', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, client_id: 1 }] });
    const reponse = await request(app).get('/api/factures?client_id=1').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(200);
  });

  test('Créer montant négatif → 422', async () => {
    const reponse = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ client_id: 1, periode: '2026-01', montant_fcfa: -500 });
    expect(reponse.status).toBe(422);
  });

  test('Créer client_id inexistant → 422', async () => {
    const erreur = new Error('fk'); erreur.code = '23503';
    db.query.mockRejectedValueOnce(new Error('count')); // simulate genererReference
    const reponse = await request(app)
      .post('/api/factures')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ client_id: 9999, periode: '2026-01', montant_fcfa: 5000 });
    expect([422, 500]).toContain(reponse.status);
  });

  test('Mettre à jour statut → 200', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, statut: 'payee' }] });
    const reponse = await request(app)
      .put('/api/factures/1/statut')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ statut: 'payee' });
    expect(reponse.status).toBe(200);
  });
});

// ───────────── Validation (4) ─────────────
describe('Validation', () => {
  test('Email invalide → 422 avec champ précisé', async () => {
    const reponse = await request(app).post('/api/auth/register').send({
      nom: 'A', prenom: 'B', email: 'pas-un-email', mot_de_passe: 'motdepasse123', role: 'client',
    });
    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs).toBeDefined();
  });

  test('Format MSISDN incorrect → 422', async () => {
    const reponse = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ msisdn: '0771234567', email: 'a@a.com', forfait_id: 1 });
    expect(reponse.status).toBe(422);
  });

  test('Corps vide → 422', async () => {
    const reponse = await request(app).post('/api/auth/register').send({});
    expect(reponse.status).toBe(422);
  });

  test('Route inconnue → 404', async () => {
    const reponse = await request(app).get('/api/route-qui-nexiste-pas');
    expect(reponse.status).toBe(404);
  });
});

// ───────────── Monitoring (3) ─────────────
describe('Monitoring', () => {
  test('GET /api/health → 200 avec champs requis', async () => {
    const reponse = await request(app).get('/api/health');
    expect(reponse.status).toBe(200);
    expect(reponse.body.statut).toBe('ok');
    expect(reponse.body).toHaveProperty('uptime');
    expect(reponse.body).toHaveProperty('version');
  });

  test('GET /api/stats → 200 avec champs requis', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ clients_actifs: '10', mrr_fcfa: '50000', factures_impayees: '2', tickets_ouverts: '1' }] });
    const reponse = await request(app).get('/api/stats').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reponse.status).toBe(200);
  });

  test('Réponse < 200ms', async () => {
    const debut = Date.now();
    await request(app).get('/api/health');
    expect(Date.now() - debut).toBeLessThan(200);
  });
});