# Multi-stage Dockerfile for Uno KaWiHe (Node 22 + React + WebSockets)
# Optimized for Oracle Cloud (x86_64 and ARM64 Ampere A1)

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=512"

# Copy package.json and install dependencies (single install for build + prod prune)
COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund --maxsockets=3

# Copy source code, build Vite frontend + bundle server.mjs, then prune devDependencies
COPY . .
RUN npm run build && npx --no-install esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/server.mjs && npm prune --omit=dev --legacy-peer-deps

# Stage 2: Production Runner (Pure Node, zero tsx/esbuild overhead in RAM)
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built frontend, compiled server bundle, and pruned node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["node", "--max-old-space-size=256", "dist-server/server.mjs"]
