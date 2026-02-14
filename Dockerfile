FROM node:20-alpine

WORKDIR /app

# Install PostgreSQL client tools for backup/restore
RUN apk add --no-cache postgresql-client

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
