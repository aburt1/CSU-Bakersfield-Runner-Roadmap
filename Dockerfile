FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN cd client && npm ci && cd ../server && npm ci

# Copy source and build client
COPY client/ ./client/
COPY server/ ./server/
RUN cd client && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/server/ ./server/
COPY --from=build /app/client/dist/ ./client/dist/

RUN cd server && npm ci

EXPOSE 3001

# Seed demo data on first start (idempotent — ON CONFLICT DO NOTHING), then start server
CMD ["sh", "-c", "cd server && npx tsx db/seed.ts --force --once && cd /app && npx tsx server/index.ts"]
