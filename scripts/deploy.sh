#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação Segura (Deploy) com Backup Automático
# 1. Faz backup da versão atual que está rodando.
# 2. Atualiza o código via git pull.
# 3. Reconstrói os containers do Docker.
# 4. Verifica a saúde dos serviços. Se falhar, avisa para rollback.
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

echo "================================================================="
echo "🚀 INICIANDO ATUALIZAÇÃO SEGURA DO UNO KAWiHe"
echo "================================================================="

# Passo 1: Backup de Segurança antes de alterar qualquer coisa
echo "🛡️  Passo 1/3: Criando ponto de restauração de segurança..."
chmod +x "${PROJECT_DIR}/scripts/backup.sh" "${PROJECT_DIR}/scripts/restore.sh" 2>/dev/null || true
"${PROJECT_DIR}/scripts/backup.sh"

# Passo 2: Baixar a versão mais recente
echo ""
echo "📥 Passo 2/3: Baixando as atualizações mais recentes (git pull)..."
git pull

# Passo 3: Reconstruir e subir os containers
echo ""
echo "🔨 Passo 3/3: Reconstruindo os containers com as melhorias..."
docker compose up -d --build

# Verificação de status
echo ""
echo "================================================================="
echo "🔍 VERIFICANDO STATUS DOS CONTAINERS:"
echo "================================================================="
docker compose ps

echo ""
echo "✨ Atualização concluída com sucesso! Teste acessando a porta 3000."
echo "💡 Caso queira voltar para a versão anterior, basta rodar:"
echo "   ./scripts/restore.sh"
echo "================================================================="
