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

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=build /app/server/ ./server/
COPY --from=build /app/client/dist/ ./client/dist/

EXPOSE 3001

CMD ["node", "server/index.js"]
