#!/usr/bin/env bash
# ============================================================
#  setup-arborescence.sh — Crée uniquement la structure de dossiers
#  et fichiers vides du projet Sénégal Connect (aucun code dedans).
#  Usage : bash setup-arborescence.sh
#  (Sur Windows : lance-le depuis Git Bash ou WSL)
# ============================================================
set -e

echo "Création de l'arborescence Sénégal Connect (fichiers vides)..."

# ---------- Dossiers ----------
mkdir -p src/config
mkdir -p src/middleware
mkdir -p src/routes
mkdir -p src/controllers
mkdir -p src/socket
mkdir -p public/js
mkdir -p public/css
mkdir -p tests
mkdir -p docs
mkdir -p uploads
mkdir -p logs

# ---------- Fichiers racine ----------
touch .gitignore
touch .env.example
touch README.md
touch package.json
touch Dockerfile
touch docker-compose.yml

# ---------- src/config ----------
touch src/config/db.js
touch src/config/logger.js
touch src/config/swagger.js

# ---------- src/middleware ----------
touch src/middleware/auth.js
touch src/middleware/upload.js
touch src/middleware/erreurs.js

# ---------- src/routes ----------
touch src/routes/auth.js
touch src/routes/clients.js
touch src/routes/forfaits.js
touch src/routes/factures.js
touch src/routes/tickets.js
touch src/routes/stats.js

# ---------- src/controllers ----------
touch src/controllers/clientsController.js
touch src/controllers/forfaitsController.js
touch src/controllers/facturesController.js
touch src/controllers/ticketsController.js
touch src/controllers/statsController.js

# ---------- src/socket ----------
touch src/socket/support.js
touch src/socket/appels.js

# ---------- src (racine) ----------
touch src/server.js

# ---------- public ----------
touch public/index.html
touch public/js/app.js
touch public/js/webrtc.js
touch public/css/app.css

# ---------- tests ----------
touch tests/api.test.js

# ---------- docs ----------
touch docs/schema.sql

# ---------- uploads / logs (garder les dossiers vides sous Git) ----------
touch uploads/.gitkeep
touch logs/.gitkeep

echo ""
echo "✅ Arborescence créée (fichiers vides)."
echo ""
find . -type f -not -path './setup-arborescence.sh' | sort
