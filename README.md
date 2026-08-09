# Sénégal Connect 🇸🇳

Plateforme web de gestion centralisée des souscriptions, de la facturation, des tickets de support et de l'assistance en direct (chat + appels audio/vidéo WebRTC) pour un opérateur télécom sénégalais.

Projet Fin de Module — Technologie Client-Serveur, L3 DSTI, Polytech Diamniadio, UAM.

---

## 🚀 Prérequis

- **Node.js** v20 ou supérieur
- **npm** v9 ou supérieur
- **Docker** & **Docker Compose** (pour le lancement conteneurisé)
- **PostgreSQL** 14 (uniquement si exécuté hors Docker)

---

## 🛠️ Installation locale (sans Docker)

```bash
git clone <url-du-depot>
cd Senegal-Connect
npm install
cp .env.example .env
# Éditer .env : renseigner DB_PASS, JWT_SECRET (≥ 64 caractères aléatoires), etc.
npm run dev
```

Le serveur démarre sur `http://localhost:3000`. Assure-toi qu'une base PostgreSQL locale existe et que le schéma `docs/schema.sql` y a été exécuté :

```bash
psql -U postgres -d senegal_connect -f docs/schema.sql
```

## 🐳 Lancement avec Docker

```bash
cp .env.example .env
# Éditer .env (DB_PASS, JWT_SECRET) avant de lancer

docker compose up -d
```

Cette seule commande démarre l'API **et** PostgreSQL, initialise automatiquement le schéma (`docs/schema.sql` monté dans `docker-entrypoint-initdb.d`), et attend que la base soit prête (`healthcheck`) avant de démarrer l'API.

Vérifier que tout tourne :
```bash
curl http://localhost:3000/api/health
```

## 📖 Documentation Swagger

Une fois le serveur démarré : **http://localhost:3000/api/docs**

Spécification OpenAPI exportable en JSON (pour Postman/Insomnia) : `http://localhost:3000/api/docs.json`

Pour tester une route protégée depuis Swagger UI : bouton **Authorize** en haut de page, coller le token JWT obtenu via `/api/auth/login` (sans le préfixe `Bearer`).

## 🧪 Tests

```bash
npm test          # lance la suite Jest (BDD mockée, aucun PostgreSQL requis)
npm run test:cov  # avec rapport de couverture
```

## 📋 Tableau des endpoints principaux

| Module | Méthode | Endpoint | Description | Accès |
|---|---|---|---|---|
| Auth | POST | `/api/auth/inscription-client` | Inscription publique d'un client | Public |
| Auth | POST | `/api/auth/register` | Création d'un compte agent/admin | Admin |
| Auth | POST | `/api/auth/login` | Connexion, obtention du JWT | Public |
| Auth | GET | `/api/auth/profil` | Profil de l'utilisateur connecté | Authentifié |
| Clients | GET | `/api/clients` | Liste paginée des clients | Authentifié |
| Clients | GET | `/api/clients/:id` | Détail d'un client | Authentifié |
| Clients | POST | `/api/clients` | Créer un client | Admin |
| Clients | PATCH | `/api/clients/:id/statut` | Changer le statut (actif/suspendu/résilié) | Admin, ou Client sur son propre compte |
| Clients | DELETE | `/api/clients/me` | Supprimer son propre compte | Client |
| Forfaits | GET | `/api/forfaits` | Liste des forfaits actifs | Public |
| Forfaits | POST | `/api/forfaits` | Créer un forfait | Admin |
| Factures | GET | `/api/factures` | Liste paginée des factures | Authentifié |
| Factures | POST | `/api/factures/generer-mensuelles` | Génération automatique du cycle mensuel | Admin |
| Tickets | GET | `/api/tickets` | Liste des tickets (filtrée selon le rôle) | Authentifié |
| Tickets | POST | `/api/tickets` | Ouvrir un ticket de support | Client |
| Tickets | PATCH | `/api/tickets/:id/assigner` | Prise en charge exclusive par un agent | Agent/Admin |
| Stats | GET | `/api/stats` | Tableau de bord (clients actifs, MRR, factures impayées, tickets ouverts) | Admin |
| Système | GET | `/api/health` | Healthcheck (utilisé par Docker) | Public |
| WebRTC | ALL | `/peerjs` | Signalisation PeerJS auto-hébergée | — |

## 🗂️ Variables d'environnement (`.env`)

Voir `.env.example` pour la liste complète et documentée : `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `MAX_FILE_SIZE`.

## 👥 Binôme

- **Ramatoulaye Dia** — API REST, authentification, PostgreSQL
- **Ndeye Coumba Fall** — Socket.IO, WebRTC/PeerJS, interface

## 📸 Captures d'écran

_A faire après_