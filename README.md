# Sénégal Connect 🇸🇳

Plateforme web de gestion centralisée des souscriptions, de la facturation, des tickets de support et de l'assistance en direct via WebRTC.

---

## 🚀 Prérequis

* **Node.js** (v18 ou supérieure)
* **npm** (v9 ou supérieure)
* **Docker** & **Docker Compose**
* **PostgreSQL** (si exécuté hors Docker)

---

## 🛠️ Installation & Lancement Local

### 1. Clonage et dépendances
```bash
git clone <url-du-depot>
cd Senegal-Connect
npm install
Module,Méthode,Endpoint,Description,Accès
Auth,POST,/api/auth/register,Inscription d'un nouveau compte client,Public
Auth,POST,/api/auth/login,Connexion & obtention du jeton JWT,Public
Clients,GET,/api/clients,Liste des clients inscrits,Admin / Agent
Clients,POST,/api/clients,Création d'une fiche client,Admin / Agent
Forfaits,GET,/api/forfaits,Liste des forfaits disponibles,Authentifié
Factures,GET,/api/factures,Consultation des factures,Authentifié
Tickets,POST,/api/tickets,Ouverture d'un ticket de support,Authentifié
Stats,GET,/api/stats,Métriques de fréquentation/ventes,Admin
PeerJS,ALL,/peerjs,Signalisation WebRTC auto-hébergée,Public