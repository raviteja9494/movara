FROM node:20-alpine

WORKDIR /app

# Install PostgreSQL client tools for backup/restore
RUN apk add --no-cache postgresql-client

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm run prisma:generate

# Copy source
COPY src ./src
COPY prisma ./prisma

# Build TypeScript
RUN npm run build

# Clean up dev dependencies
RUN rm -rf node_modules && npm ci --only=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start app
CMD ["node", "dist/main.js"]
