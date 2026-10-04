#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Completo da Aplicação Uno KaWiHe
# Salva código-fonte, banco de dados de contas (auth-data e ./data) e configurações.
# Suporta TAGs personalizadas (ex: bash backup.sh antesaudio)
# ==============================================================================
set -e

TAG="${1:-}"
TAG_CLEAN=$(echo "${TAG}" | sed 's/^#//' | tr -cd '[:alnum:]_-')

BACKUP_DIR="${HOME}/backups/uno-kawihe"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

if [ -n "${TAG_CLEAN}" ]; then
  BACKUP_FILE="${BACKUP_DIR}/uno_backup_${TAG_CLEAN}_${TIMESTAMP}.tar.gz"
  echo "🏷️  Tag identificadora de backup: #${TAG_CLEAN}"
else
  BACKUP_FILE="${BACKUP_DIR}/uno_backup_${TIMESTAMP}.tar.gz"
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "📦 [1/3] Criando diretório de backup com permissão restrita em: ${BACKUP_DIR}..."
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# Se houver volume Docker do banco auth-data, faz exportação
echo "💾 [2/3] Exportando dados do banco de contas..."
if docker volume inspect auth-data >/dev/null 2>&1; then
  docker run --rm -v auth-data:/data -v "${BACKUP_DIR}":/backup alpine \
    tar -czf "/backup/auth_volume_${TIMESTAMP}.tar.gz" -C /data .
  chmod 600 "${BACKUP_DIR}/auth_volume_${TIMESTAMP}.tar.gz" 2>/dev/null || true
  echo "   ✓ Volume 'auth-data' salvo com sucesso."
fi

# Se existir diretório local ./data, faz cópia de segurança dedicada
if [ -d "${PROJECT_DIR}/data" ]; then
  tar -czf "${BACKUP_DIR}/data_dir_${TIMESTAMP}.tar.gz" -C "${PROJECT_DIR}" data
  chmod 600 "${BACKUP_DIR}/data_dir_${TIMESTAMP}.tar.gz" 2>/dev/null || true
  echo "   ✓ Diretório local 'data/' salvo com sucesso."
fi

# Compactando projeto completo (excluindo node_modules pesados que podem ser reinstalados)
echo "🗜️  [3/3] Compactando aplicação e arquivos de configuração..."
tar --exclude="node_modules" \
    --exclude=".git/objects" \
    --exclude="dist" \
    -czf "${BACKUP_FILE}" -C "${PROJECT_DIR}" .

chmod 600 "${BACKUP_FILE}" 2>/dev/null || true

# Salva referência do último backup
echo "${BACKUP_FILE}" > "${BACKUP_DIR}/LATEST_BACKUP.txt"

if [ -n "${TAG_CLEAN}" ]; then
  echo "${BACKUP_FILE}" > "${BACKUP_DIR}/LATEST_BACKUP_${TAG_CLEAN}.txt"
fi

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo ""
echo "================================================================="
echo "✅ BACKUP CONCLUÍDO COM SUCESSO!"
if [ -n "${TAG_CLEAN}" ]; then
  echo "🏷️  Tag: #${TAG_CLEAN}"
fi
echo "📁 Arquivo: ${BACKUP_FILE}"
echo "📏 Tamanho: ${FILE_SIZE}"
echo "🔒 Permissões: Restritas (chmod 700 no diretório / chmod 600 nos arquivos)"
echo "================================================================="
