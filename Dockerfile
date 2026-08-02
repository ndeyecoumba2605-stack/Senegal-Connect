FROM node:20-alpine

WORKDIR /app

# Copie des fichiers de dépendances et installation
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copie de tout le code source
COPY . .

# Création des dossiers nécessaires et attribution des droits à l'utilisateur 'node'
RUN mkdir -p uploads logs && chown -R node:node /app

# Switch vers l'utilisateur non-root
USER node

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

EXPOSE 3000
CMD ["node", "src/server.js"]