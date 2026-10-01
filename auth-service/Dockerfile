# Dockerfile for KaWiHe Central Auth Service (Node 22 Slim)
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm install -g tsx

COPY . .

EXPOSE 4000

CMD ["tsx", "server.ts"]
