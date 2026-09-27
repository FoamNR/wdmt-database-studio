# Multi-stage Dockerfile for WDMT Studio
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:24-alpine AS server-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY server/ ./server/
RUN npm run build:server

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled backend
COPY --from=server-builder /app/dist-server ./dist-server
# Copy compiled frontend
COPY --from=client-builder /app/client/dist ./client/dist

# Persistent data directory for connection profiles and sqlite databases
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "dist-server/server/index.js"]
