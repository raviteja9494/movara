FROM node:20-bookworm-slim

WORKDIR /app

# Install PostgreSQL 16 client for backup/restore (must match server major version; pg_dump 15 fails on server 16)
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && mkdir -p /usr/share/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg-apt-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg-apt-keyring.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update -qq && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and Prisma schema (needed for generate)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma

# Install all deps (prisma CLI is devDependency), generate client
RUN npm ci && npx prisma generate

# Copy source and build
COPY src ./src
RUN npm run build

# Keep only runtime deps (preserves generated Prisma client under node_modules)
RUN npm prune --production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start app
CMD ["node", "dist/main.js"]
