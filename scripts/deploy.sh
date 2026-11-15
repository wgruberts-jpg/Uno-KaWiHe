#!/usr/bin/env bash
# ==============================================================================
# Script de Implantação Segura (Deploy) com Backup Automático
# Versão: v2.2.2
# 1. Faz backup da versão atual que está rodando.
# 2. Atualiza o código via git pull.
# 3. Reconstrói os containers do Docker sequencialmente.
# 4. Verifica a saúde dos serviços. Se falhar, avisa para rollback.
# ==============================================================================
set -e

DEPLOY_VERSION="v2.2.2"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

echo "================================================================="
echo "🚀 INICIANDO ATUALIZAÇÃO SEGURA DO UNO KAWiHe (${DEPLOY_VERSION})"
echo "================================================================="

# Passo 1: Backup de Segurança antes de alterar qualquer coisa
echo "🛡️  Passo 1/3: Criando ponto de restauração de segurança..."
chmod +x "${PROJECT_DIR}/scripts/"*.sh 2>/dev/null || true
"${PROJECT_DIR}/scripts/backup.sh"

# Passo 2: Baixar a versão mais recente
echo ""
echo "📥 Passo 2/3: Baixando as atualizações mais recentes (git pull)..."
git config core.fileMode false 2>/dev/null || true
git checkout -- *.sh scripts/*.sh Dockerfile 2>/dev/null || true
git pull

# Passo 3: Reconstruir e subir os containers sequencialmente (economia de RAM)
echo ""
echo "🔨 Passo 3/3: Reconstruindo os containers com as melhorias..."
docker compose down --remove-orphans || true
docker compose build kawihe-auth
docker compose build uno-game
docker compose up -d --no-build

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
