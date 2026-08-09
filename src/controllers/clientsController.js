const { query, transaction } = require('../config/db');
const bcrypt = require('bcryptjs');

async function lister(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite) || 20, 100);
    const offset = (page - 1) * limite;

    const conditions = [];
    const valeurs = [];

    if (req.query.statut) {
      valeurs.push(req.query.statut);
      conditions.push(`c.statut = $${valeurs.length}`);
    }
    if (req.query.forfait_id) {
      valeurs.push(req.query.forfait_id);
      conditions.push(`c.forfait_id = $${valeurs.length}`);
    }
    if (req.query.q) {
      valeurs.push(`%${req.query.q}%`);
      const idx = valeurs.length;
      conditions.push(`(c.msisdn ILIKE $${idx} OR u.nom ILIKE $${idx} OR u.email ILIKE $${idx})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = await query(
      `SELECT COUNT(*) FROM clients c JOIN utilisateurs u ON u.id = c.utilisateur_id ${where}`,
      valeurs
    );

    const donnees = await query(
      `SELECT c.id, c.msisdn, c.statut, c.date_inscription, c.forfait_id,
              u.nom, u.prenom, u.email
       FROM clients c
       JOIN utilisateurs u ON u.id = c.utilisateur_id
       ${where}
       ORDER BY c.id
       LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
      [...valeurs, limite, offset]
    );

    const totalLignes = parseInt(total.rows[0].count, 10);

    res.json({
      data: donnees.rows,
      pagination: { total: totalLignes, page, limite, total_pages: Math.ceil(totalLignes / limite) },
    });
  } catch (err) {
    next(err);
  }
}

async function obtenirDetail(req, res, next) {
  try {
    const { id } = req.params;

    // Recherche par c.id ou c.utilisateur_id pour éviter le décalage d'ID
    const client = await query(
      `SELECT c.*, u.nom, u.prenom, u.email,
              f.nom AS forfait_nom, f.quota_data_go, f.quota_voix_min, f.prix_mensuel_fcfa
       FROM clients c
       JOIN utilisateurs u ON u.id = c.utilisateur_id
       LEFT JOIN forfaits f ON f.id = c.forfait_id
       WHERE c.id = $1 OR c.utilisateur_id = $1`,
      [id]
    );

    if (client.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    // On récupère le véritable ID de la table clients pour les requêtes suivantes
    const clientId = client.rows[0].id;

    const derniereFacture = await query(
      `SELECT * FROM factures WHERE client_id = $1 ORDER BY date_emission DESC LIMIT 1`,
      [clientId]
    );

    const ticketEnCours = await query(
      `SELECT * FROM tickets WHERE client_id = $1 AND statut != 'ferme' ORDER BY ouvert_le DESC LIMIT 1`,
      [clientId]
    );

    res.json({
      ...client.rows[0],
      derniere_facture: derniereFacture.rows[0]?.montant_fcfa || null,
      ticket_en_cours: ticketEnCours.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
}
async function creer(req, res, next) {
  try {
    const { nom, prenom, email, msisdn, forfait_id } = req.body;
    const motDePasseTemporaire = await bcrypt.hash(msisdn, 12);

    const resultat = await transaction(async (client) => {
      const utilisateur = await client.query(
        `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
         VALUES ($1, $2, $3, $4, 'client') RETURNING id`,
        [nom, prenom, email, motDePasseTemporaire]
      );

      const nouveauClient = await client.query(
        `INSERT INTO clients (utilisateur_id, msisdn, forfait_id) VALUES ($1, $2, $3) RETURNING *`,
        [utilisateur.rows[0].id, msisdn, forfait_id]
      );

      return nouveauClient.rows[0];
    });

    res.status(201).json(resultat);
  } catch (err) {
    next(err);
  }
}

async function modifier(req, res, next) {
  try {
    const { id } = req.params;
    const { nom, prenom, email, msisdn, forfait_id } = req.body;

    const clientExistant = await query('SELECT utilisateur_id FROM clients WHERE id = $1', [id]);
    if (clientExistant.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    await transaction(async (client) => {
      await client.query(`UPDATE utilisateurs SET nom = $1, prenom = $2, email = $3 WHERE id = $4`, [
        nom, prenom, email, clientExistant.rows[0].utilisateur_id,
      ]);
      await client.query(`UPDATE clients SET msisdn = $1, forfait_id = $2 WHERE id = $3`, [msisdn, forfait_id, id]);
    });

    const resultat = await query('SELECT * FROM clients WHERE id = $1', [id]);
    res.json(resultat.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function changerStatut(req, res, next) {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    // Le paramètre :id peut être clients.id OU utilisateurs.id (self-service) :
    // on résout systématiquement le vrai clients.id avant toute vérification,
    // sinon la vérification des factures impayées ci-dessous comparerait
    // client_id (clients.id) à un utilisateurs.id et ne matcherait jamais.
    const clientRes = await query(
      `SELECT id FROM clients WHERE id = $1 OR utilisateur_id = $1`,
      [id]
    );
    if (clientRes.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    const clientId = clientRes.rows[0].id;

    if (statut === 'resilie') {
      const impayees = await query(
        `SELECT COUNT(*) FROM factures WHERE client_id = $1 AND statut IN ('impayee','en_retard')`,
        [clientId]
      );
      if (parseInt(impayees.rows[0].count, 10) > 0) {
        return res.status(409).json({ message: 'Impossible de résilier : le client a des factures impayées' });
      }
    }

    const resultat = await query(`UPDATE clients SET statut = $1 WHERE id = $2 RETURNING *`, [statut, clientId]);
    res.json(resultat.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function supprimer(req, res, next) {
  try {
    const { id } = req.params;

    const clientRes = await query(
      `SELECT id FROM clients WHERE id = $1 OR utilisateur_id = $1`,
      [id]
    );
    if (clientRes.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    const clientId = clientRes.rows[0].id;

    const impayees = await query(
      `SELECT COUNT(*) FROM factures WHERE client_id = $1 AND statut IN ('impayee','en_retard')`,
      [clientId]
    );
    if (parseInt(impayees.rows[0].count, 10) > 0) {
      return res.status(409).json({ message: 'Impossible de supprimer : le client a des factures impayées' });
    }

    await query('DELETE FROM clients WHERE id = $1', [clientId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ── Suppression de son propre compte (self-service) ──────────────────────
// Supprime le compte utilisateur ENTIER (pas seulement la fiche client) :
// utilisateurs.id est la clé référencée par clients.utilisateur_id avec
// ON DELETE CASCADE, donc supprimer la ligne utilisateurs entraîne
// automatiquement la suppression de la fiche client, et met agent_id à NULL
// sur les tickets déjà traités (ON DELETE SET NULL), sans rien casser.
async function supprimerMonCompte(req, res, next) {
  try {
    const utilisateurId = req.user.id;

    const clientRes = await query(`SELECT id FROM clients WHERE utilisateur_id = $1`, [utilisateurId]);
    if (clientRes.rows.length === 0) return res.status(404).json({ message: 'Profil client introuvable' });
    const clientId = clientRes.rows[0].id;

    const impayees = await query(
      `SELECT COUNT(*) FROM factures WHERE client_id = $1 AND statut IN ('impayee','en_retard')`,
      [clientId]
    );
    if (parseInt(impayees.rows[0].count, 10) > 0) {
      return res.status(409).json({ message: 'Impossible de supprimer votre compte : vous avez des factures impayées' });
    }

    await query('DELETE FROM utilisateurs WHERE id = $1', [utilisateurId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ── Changement de forfait (self-service) ─────────────────────────────────
// Un client peut changer lui-même de forfait (ex: depuis son tableau de
// bord) ; un admin peut le faire pour n'importe quel client. Le contrôle
// "le client ne peut cibler que sa propre fiche" est fait dans la route.
async function changerForfait(req, res, next) {
  try {
    const { id } = req.params;
    const { forfait_id } = req.body;

    const forfait = await query('SELECT * FROM forfaits WHERE id = $1 AND actif = true', [forfait_id]);
    if (forfait.rows.length === 0) {
      return res.status(422).json({ message: "Le forfait demandé n'existe pas ou n'est plus disponible" });
    }

    const resultat = await query(
      `UPDATE clients SET forfait_id = $1 WHERE id = $2 OR utilisateur_id = $2 RETURNING *`,
      [forfait_id, id]
    );
    if (resultat.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    res.json({ ...resultat.rows[0], forfait: forfait.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  lister, obtenirDetail, creer, modifier, changerStatut, changerForfait,
  supprimer, supprimerMonCompte,
};
