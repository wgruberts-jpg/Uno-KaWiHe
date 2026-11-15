# Dockerfile for KaWiHe Central Auth Service (Node 22 Slim)
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS="--max-old-space-size=384"

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --maxsockets=3 && npm install -g tsx --no-audit --no-fund

COPY . .

EXPOSE 4000

CMD ["tsx", "server.ts"]
