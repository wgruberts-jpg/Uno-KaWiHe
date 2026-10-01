#!/usr/bin/env bash
# ==============================================================================
# Script de Rollback / Restauração do Uno KaWiHe
# Restaura o código e o banco a partir de um backup e reimplanta os containers.
# ==============================================================================
set -e

BACKUP_DIR="${HOME}/backups/uno-kawihe"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Se o usuário passou um arquivo específico como argumento, usa ele. Senão pega o mais recente.
if [ -n "$1" ]; then
  BACKUP_FILE="$1"
elif [ -f "${BACKUP_DIR}/LATEST_BACKUP.txt" ]; then
  BACKUP_FILE=$(cat "${BACKUP_DIR}/LATEST_BACKUP.txt")
else
  # Pega o arquivo tar.gz mais recente do diretório de backup
  BACKUP_FILE=$(ls -t "${BACKUP_DIR}"/uno_backup_*.tar.gz 2>/dev/null | head -n 1)
fi

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Erro: Nenhum arquivo de backup encontrado para restaurar!"
  echo "Uso: ./scripts/restore.sh [caminho/do/arquivo_backup.tar.gz]"
  exit 1
fi

echo "================================================================="
echo "🔄 INICIANDO RESTAURAÇÃO / ROLLBACK"
echo "📁 Restaurando a partir de: ${BACKUP_FILE}"
echo "================================================================="

echo "🛑 [1/4] Parando containers atuais do Uno..."
cd "${PROJECT_DIR}"
docker compose down || true

echo "📂 [2/4] Descompactando arquivos do backup..."
tar -xzf "${BACKUP_FILE}" -C "${PROJECT_DIR}"

# Restaura volume Docker se houver arquivo correspondente
VOLUME_BACKUP=$(echo "${BACKUP_FILE}" | sed 's/uno_backup_/auth_volume_/')
if [ -f "${VOLUME_BACKUP}" ]; then
  echo "💾 [3/4] Restaurando volume de banco de contas (auth-data)..."
  docker volume create auth-data >/dev/null 2>&1 || true
  docker run --rm -v auth-data:/data -v "${BACKUP_DIR}":/backup alpine \
    sh -c "rm -rf /data/* && tar -xzf /backup/$(basename "${VOLUME_BACKUP}") -C /data"
  echo "   ✓ Dados de contas restaurados com sucesso."
else
  echo "ℹ️  [3/4] Sem arquivo de volume separado, mantendo dados existentes."
fi

echo "🚀 [4/4] Reconstruindo e iniciando os containers..."
docker compose up -d --build

echo ""
echo "================================================================="
echo "✅ RESTAURAÇÃO E REIMPLANTAÇÃO CONCLUÍDAS COM SUCESSO!"
echo "================================================================="
docker compose ps
