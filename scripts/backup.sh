#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Completo da Aplicação Uno KaWiHe
# Salva código-fonte, banco de dados de contas (auth-data) e configurações.
# ==============================================================================
set -e

BACKUP_DIR="${HOME}/backups/uno-kawihe"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/uno_backup_${TIMESTAMP}.tar.gz"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "📦 [1/3] Criando diretório de backup em: ${BACKUP_DIR}..."
mkdir -p "${BACKUP_DIR}"

# Se houver volume Docker do banco auth-data, faz exportação
echo "💾 [2/3] Exportando dados do banco de contas..."
if docker volume inspect auth-data >/dev/null 2>&1; then
  docker run --rm -v auth-data:/data -v "${BACKUP_DIR}":/backup alpine \
    tar -czf "/backup/auth_volume_${TIMESTAMP}.tar.gz" -C /data .
  echo "   ✓ Volume 'auth-data' salvo com sucesso."
fi

# Compactando projeto completo (excluindo node_modules pesados que podem ser reinstalados)
echo "🗜️  [3/3] Compactando aplicação e arquivos de configuração..."
tar --exclude="node_modules" \
    --exclude=".git/objects" \
    --exclude="dist" \
    -czf "${BACKUP_FILE}" -C "${PROJECT_DIR}" .

# Salva referência do último backup
echo "${BACKUP_FILE}" > "${BACKUP_DIR}/LATEST_BACKUP.txt"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo ""
echo "================================================================="
echo "✅ BACKUP CONCLUÍDO COM SUCESSO!"
echo "📁 Arquivo: ${BACKUP_FILE}"
echo "📏 Tamanho: ${FILE_SIZE}"
echo "================================================================="
