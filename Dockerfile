# Multi-stage Dockerfile for Uno KaWiHe (Node 22 + React + WebSockets)
# Optimized for Oracle Cloud (x86_64 and ARM64 Ampere A1)

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy source code and build Vite frontend
COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm install -g tsx

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
