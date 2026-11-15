# Multi-stage Dockerfile for KaWiHe Central Auth Service (Node 22 Slim - Low RAM)
FROM node:22-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=384"

COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund --maxsockets=3

COPY . .
RUN npx --yes esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/server.mjs && npm prune --omit=dev --legacy-peer-deps

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist-server ./dist-server

EXPOSE 4000

CMD ["node", "--max-old-space-size=128", "dist-server/server.mjs"]
