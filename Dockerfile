# Prexacode: web + API en una sola imagen (la API sirve la web compilada).
# Construir:  docker build -t prexacode .
# Correr:     ver docker-compose.yml y DEPLOY.md

# 1) Web (React + Vite)
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json components.json* ./
COPY public ./public
COPY src ./src
RUN npx vite build

# 2) API (Fastify, compilada a JavaScript)
FROM node:22-alpine AS api
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig*.json ./
COPY server/src ./src
COPY server/drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

# 3) Imagen final: solo lo necesario para correr
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    SERVIR_WEB=/app/dist \
    TRUST_PROXY=1
WORKDIR /app/server
COPY --from=api --chown=node:node /app/server/package.json ./
COPY --from=api --chown=node:node /app/server/node_modules ./node_modules
COPY --from=api --chown=node:node /app/server/dist ./dist
COPY --from=api --chown=node:node /app/server/drizzle ./drizzle
COPY --from=web --chown=node:node /app/dist /app/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Al arrancar aplica las migraciones pendientes de la base
CMD ["node", "dist/index.js"]
