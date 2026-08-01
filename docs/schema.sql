-- schema.sql — Sénégal Connect — Base de données de l'opérateur télécom
-- Exécuter : psql -U postgres -d senegal_connect -f docs/schema.sql

SET client_encoding = 'UTF8';

-- ── Table des utilisateurs (clients + agents + admins) ──────────────
CREATE TABLE IF NOT EXISTS utilisateurs (
    id            SERIAL PRIMARY KEY,
    nom           VARCHAR(100) NOT NULL CHECK (nom <> ''),
    prenom        VARCHAR(100) NOT NULL CHECK (prenom <> ''),
    email         VARCHAR(200) NOT NULL UNIQUE,
    mot_de_passe  VARCHAR(255) NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('client','agent','admin')),
    cree_le       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role  ON utilisateurs(role);

-- ── Table des forfaits ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forfaits (
    id                SERIAL PRIMARY KEY,
    nom               VARCHAR(50)   NOT NULL,
    quota_data_go     NUMERIC(6,2)  NOT NULL CHECK (quota_data_go >= 0),
    quota_voix_min    INTEGER       NOT NULL CHECK (quota_voix_min >= 0),
    prix_mensuel_fcfa NUMERIC(10,2) NOT NULL CHECK (prix_mensuel_fcfa > 0),
    actif             BOOLEAN       NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_forfaits_actif ON forfaits(actif);

-- ── Table des clients (abonnés) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id                SERIAL PRIMARY KEY,
    utilisateur_id    INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    msisdn            VARCHAR(15) NOT NULL UNIQUE
                       CHECK (msisdn ~ '^\+221[0-9]{9}$'),
    forfait_id        INTEGER REFERENCES forfaits(id) ON DELETE RESTRICT,
    statut            VARCHAR(10) NOT NULL DEFAULT 'actif'
                       CHECK (statut IN ('actif','suspendu','resilie')),
    date_inscription  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_msisdn  ON clients(msisdn);
CREATE INDEX IF NOT EXISTS idx_clients_forfait ON clients(forfait_id);
CREATE INDEX IF NOT EXISTS idx_clients_statut  ON clients(statut);

-- ── Table des factures ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
    id            SERIAL PRIMARY KEY,
    client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    reference     VARCHAR(20) NOT NULL UNIQUE,
    periode       VARCHAR(7)  NOT NULL CHECK (periode ~ '^[0-9]{4}-[0-9]{2}$'),
    montant_fcfa  NUMERIC(10,2) NOT NULL CHECK (montant_fcfa >= 0),
    statut        VARCHAR(10) NOT NULL DEFAULT 'impayee'
                   CHECK (statut IN ('payee','impayee','en_retard')),
    date_emission TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_echeance TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days')
);
CREATE INDEX IF NOT EXISTS idx_factures_client  ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut  ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_periode ON factures(periode);

-- ── Table des tickets de support ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
    id         SERIAL PRIMARY KEY,
    client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    agent_id   INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    sujet      VARCHAR(255) NOT NULL,
    statut     VARCHAR(10) NOT NULL DEFAULT 'ouvert'
                CHECK (statut IN ('ouvert','en_cours','ferme')),
    ouvert_le  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ferme_le   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent  ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_statut ON tickets(statut);

CREATE TABLE IF NOT EXISTS messages (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    expediteur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type           VARCHAR(10) NOT NULL DEFAULT 'texte'
                    CHECK (type IN ('texte','fichier','image','audio')),
    contenu        TEXT,
    fichier_url    VARCHAR(500),
    fichier_nom    VARCHAR(255),
    fichier_taille INTEGER,
    envoye_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket    ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_envoye_le ON messages(envoye_le DESC);

CREATE TABLE IF NOT EXISTS messages_statut (
    message_id     INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    statut         VARCHAR(10) NOT NULL DEFAULT 'envoye'
                    CHECK (statut IN ('envoye','lu')),
    lu_le          TIMESTAMPTZ,
    PRIMARY KEY (message_id, utilisateur_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_statut_message ON messages_statut(message_id);

CREATE TABLE IF NOT EXISTS reactions (
    message_id     INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    emoji          VARCHAR(10) NOT NULL,
    PRIMARY KEY (message_id, utilisateur_id, emoji)
);

CREATE TABLE IF NOT EXISTS appels (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    initiateur_id   INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    destinataire_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type            VARCHAR(10) NOT NULL CHECK (type IN ('audio','video')),
    statut          VARCHAR(10) NOT NULL DEFAULT 'sonnerie'
                     CHECK (statut IN ('sonnerie','accepte','refuse','termine')),
    duree_secondes  INTEGER,
    debut_le        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fin_le          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_appels_ticket ON appels(ticket_id);
CREATE INDEX IF NOT EXISTS idx_appels_statut ON appels(statut);

-- ── Table des demandes de réinitialisation de mot de passe ──────────
CREATE TABLE IF NOT EXISTS reinitialisations_mdp (
    id             SERIAL PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    token          VARCHAR(255) NOT NULL UNIQUE,
    expire_le      TIMESTAMPTZ NOT NULL,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reinitialisations_token ON reinitialisations_mdp(token);

-- ══════════════════════════════════════════════════════════
-- Jeu de données de test — UNIQUEMENT les forfaits.
-- Aucun utilisateur pré-établi : les comptes sont créés via
-- /api/auth/inscription-client (clients) ou /api/auth/register (agents/admins).
-- ══════════════════════════════════════════════════════════
INSERT INTO forfaits (nom, quota_data_go, quota_voix_min, prix_mensuel_fcfa, actif) VALUES
('Forfait Eco',      2,  60,   3000, TRUE),
('Forfait Confort',  10, 300,  8000, TRUE),
('Forfait Premium',  30, 1000, 15000, TRUE),
('Forfait Illimite', 50, 3000, 25000, TRUE);
