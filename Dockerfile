# Multi-stage Dockerfile for Uno KaWiHe (Node 22 + React + WebSockets)
# Optimized for Oracle Cloud (x86_64 and ARM64 Ampere A1)

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=512"

# Copy package.json and install dependencies (single install for build + prod prune)
COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund --maxsockets=3

# Copy source code and build Vite frontend, then prune devDependencies
COPY . .
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

# Stage 2: Production Runner
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built frontend, pruned node_modules, and server files from builder (serializes stage after builder)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/utils ./src/utils
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Install only lightweight tsx runner globally
RUN npm install -g tsx --no-audit --no-fund

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["tsx", "server.ts"]
