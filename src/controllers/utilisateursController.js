const { query } = require('../config/db');

// Liste des agents et admins (comptes internes), avec filtre optionnel par rôle.
// Ne renvoie jamais mot_de_passe.
async function lister(req, res, next) {
  try {
    const { role } = req.query;
    const conditions = [`role IN ('agent','admin')`];
    const valeurs = [];

    if (role && ['agent', 'admin'].includes(role)) {
      valeurs.push(role);
      conditions.push(`role = $${valeurs.length}`);
    }

    const resultat = await query(
      `SELECT id, nom, prenom, email, role, cree_le
       FROM utilisateurs
       WHERE ${conditions.join(' AND ')}
       ORDER BY cree_le DESC`,
      valeurs
    );

    // Petite statistique utile pour le tableau de bord admin : charge de
    // chaque agent (tickets actuellement en cours).
    const charge = await query(
      `SELECT agent_id, COUNT(*) AS tickets_en_cours
       FROM tickets WHERE statut = 'en_cours' AND agent_id IS NOT NULL
       GROUP BY agent_id`
    );
    const chargeParAgent = Object.fromEntries(
      charge.rows.map((r) => [r.agent_id, parseInt(r.tickets_en_cours, 10)])
    );

    res.json({
      data: resultat.rows.map((u) => ({ ...u, tickets_en_cours: chargeParAgent[u.id] || 0 })),
    });
  } catch (err) {
    next(err);
  }
}

// Suppression d'un compte agent/admin. Les tickets déjà assignés à cet agent
// repassent automatiquement à agent_id = NULL (ON DELETE SET NULL, cf schema.sql)
// et redeviennent visibles dans la file d'attente des autres agents.
async function supprimer(req, res, next) {
  try {
    const { id } = req.params;

    const cible = await query(`SELECT role FROM utilisateurs WHERE id = $1`, [id]);
    if (cible.rows.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' });
    if (!['agent', 'admin'].includes(cible.rows[0].role)) {
      return res.status(400).json({ message: 'Seuls les comptes agent ou admin peuvent être supprimés ici' });
    }
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    await query(`DELETE FROM utilisateurs WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { lister, supprimer };
