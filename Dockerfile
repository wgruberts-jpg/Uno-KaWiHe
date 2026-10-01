# Multi-stage Dockerfile for UNO Multiplayer Game (Node 22 + React + WebSockets)
# Compatible with both x86_64 and ARM64 (Oracle Cloud Ampere A1)

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy source code and build the Vite frontend
COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy built frontend assets and server files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/utils ./src/utils
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["tsx", "server.ts"]
