#!/usr/bin/env bash
# ==============================================================================
# Uno KaWiHe - Status & Health Check Script
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

echo "================================================================="
echo "🎮 UNO KAWIHE - STATUS DOS SERVIÇOS"
echo "================================================================="
echo "Data/Hora: $(date '+%d/%m/%Y %H:%M:%S %Z')"
echo ""

# 1. Checa microserviço Uno Game Server (porta 3000)
echo "📡 Verificando Servidor Uno (porta 3000)..."
if curl -s --max-time 2 http://localhost:3000/health >/dev/null 2>&1; then
  echo "   ✅ Servidor Uno: ONLINE e Respondendo em http://localhost:3000"
else
  echo "   ⚠️ Servidor Uno: Não respondendo na porta 3000"
fi

# 2. Checa microserviço Auth Service (porta 4000)
echo "📡 Verificando Serviço de Autenticação (porta 4000)..."
if curl -s --max-time 2 http://localhost:4000/health >/dev/null 2>&1; then
  echo "   ✅ Serviço Auth: ONLINE e Respondendo em http://localhost:4000"
else
  echo "   ℹ️ Serviço Auth dedicado não ativo na porta 4000 (rodando integrado no servidor principal)"
fi

# 3. Docker Containers
if command -v docker >/dev/null 2>&1; then
  echo ""
  echo "🐳 Containers Docker:"
  docker compose ps 2>/dev/null || docker ps --filter "name=kawihe" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "   Nenhum container Docker em execução."
fi

echo "================================================================="
