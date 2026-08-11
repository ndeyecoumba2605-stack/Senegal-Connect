const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../config/db');
const logger = require('../config/logger');

const COUT_BCRYPT = 12;
const DUREE_VALIDITE_TOKEN_MINUTES = 30;

async function creerUtilisateur(req, res, next, role) {
  try {
    const { nom, prenom, email, mot_de_passe } = req.body;
    const hash = await bcrypt.hash(mot_de_passe, COUT_BCRYPT);

    const resultat = await query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nom, prenom, email, role, cree_le`,
      [nom, prenom, email, hash, role]
    );

    res.status(201).json(resultat.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Route publique: impossible de créer un agent ou un admin.
function inscrire(req, res, next) {
  return creerUtilisateur(req, res, next, 'client');
}

// Route réservée à un admin: le rôle a déjà été validé par le routeur.
function inscrireInterne(req, res, next) {
  return creerUtilisateur(req, res, next, req.body.role);
}

// POST /api/auth/inscription-client — inscription PUBLIQUE (sans JWT admin requis)
async function inscrireClient(req, res, next) {
  try {
    const { nom, prenom, email, mot_de_passe, msisdn, forfait_id } = req.body;
    const hash = await bcrypt.hash(mot_de_passe, COUT_BCRYPT);

    const resultat = await transaction(async (client) => {
      const utilisateur = await client.query(
        `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
         VALUES ($1, $2, $3, $4, 'client')
         RETURNING id, nom, prenom, email, role`,
        [nom, prenom, email, hash]
      );

      const nouveauClient = await client.query(
        `INSERT INTO clients (utilisateur_id, msisdn, forfait_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [utilisateur.rows[0].id, msisdn, forfait_id]
      );

      return { utilisateur: utilisateur.rows[0], client: nouveauClient.rows[0] };
    });

    const token = jwt.sign(
      { id: resultat.utilisateur.id, nom: resultat.utilisateur.nom, email: resultat.utilisateur.email, role: 'client' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h', issuer: 'senegal-connect' }
    );

    res.status(201).json({
      token,
      expires_in: '24h',
      utilisateur: {
        ...resultat.utilisateur,
        client_id: resultat.client.id
      },
      client: resultat.client,
    });
  } catch (err) {
    next(err);
  }
}

async function connecter(req, res, next) {
  try {
    const { email, mot_de_passe } = req.body;

    const resultat = await query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    const utilisateur = resultat.rows[0];

    const motDePasseValide = utilisateur
      ? await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe)
      : await bcrypt.compare(mot_de_passe, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');

    if (!utilisateur || !motDePasseValide) {
      logger.warn(`Tentative de connexion échouée pour l'email : ${email}`);
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }

    // Récupérer le client_id si l'utilisateur est un client
    let clientId = null;
    if (utilisateur.role === 'client') {
      const clientRes = await query('SELECT id FROM clients WHERE utilisateur_id = $1', [utilisateur.id]);
      if (clientRes.rows.length > 0) {
        clientId = clientRes.rows[0].id;
      }
    }

    const token = jwt.sign(
      { id: utilisateur.id, nom: utilisateur.nom, email: utilisateur.email, role: String(utilisateur.role || '').toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h', issuer: 'senegal-connect' }
    );

    res.json({
      token,
      expires_in: '24h',
      utilisateur: { 
        id: utilisateur.id, 
        client_id: clientId, // ID direct de la table clients
        nom: utilisateur.nom, 
        prenom: utilisateur.prenom, 
        email: utilisateur.email, 
        role: utilisateur.role 
      },
    });
  } catch (err) {
    next(err);
  }
}

async function profil(req, res) {
  res.json(req.user);
}

// POST /api/auth/mot-de-passe-oublie
async function demanderReinitialisation(req, res, next) {
  try {
    const { email } = req.body;
    const resultat = await query('SELECT id FROM utilisateurs WHERE email = $1', [email]);

    const messagePublic = "Si ce compte existe, un lien de réinitialisation a été envoyé.";

    if (resultat.rows.length === 0) {
      return res.json({ message: messagePublic });
    }

    const utilisateurId = resultat.rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const expireLe = new Date(Date.now() + DUREE_VALIDITE_TOKEN_MINUTES * 60 * 1000);

    await query('DELETE FROM reinitialisations_mdp WHERE utilisateur_id = $1', [utilisateurId]);
    await query(
      `INSERT INTO reinitialisations_mdp (utilisateur_id, token, expire_le) VALUES ($1, $2, $3)`,
      [utilisateurId, token, expireLe]
    );

    logger.info(`Demande de réinitialisation de mot de passe pour l'utilisateur ${utilisateurId}`);

    res.json({
      message: messagePublic,
      token_demo: token,
      expire_dans_minutes: DUREE_VALIDITE_TOKEN_MINUTES,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reinitialiser-mot-de-passe
async function reinitialiserMotDePasse(req, res, next) {
  try {
    const { token, nouveau_mot_de_passe } = req.body;

    const resultat = await query(
      `SELECT * FROM reinitialisations_mdp WHERE token = $1 AND expire_le > NOW()`,
      [token]
    );

    if (resultat.rows.length === 0) {
      return res.status(400).json({ message: 'Lien de réinitialisation invalide ou expiré' });
    }

    const demande = resultat.rows[0];
    const hash = await bcrypt.hash(nouveau_mot_de_passe, COUT_BCRYPT);

    await query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2', [hash, demande.utilisateur_id]);
    await query('DELETE FROM reinitialisations_mdp WHERE utilisateur_id = $1', [demande.utilisateur_id]);

    logger.info(`Mot de passe réinitialisé pour l'utilisateur ${demande.utilisateur_id}`);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    next(err);
  }
}

module.exports = { inscrire, inscrireInterne, inscrireClient, connecter, profil, demanderReinitialisation, reinitialiserMotDePasse };