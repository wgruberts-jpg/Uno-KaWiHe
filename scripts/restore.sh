#!/usr/bin/env bash
# ==============================================================================
# Script de Restauração Completa - Uno KaWiHe
# Uso: bash scripts/restore.sh [tag_ou_arquivo]
# Exemplo: bash scripts/restore.sh antesaudio
# ==============================================================================
set -e

TAG="${1:-}"
TAG_CLEAN=$(echo "${TAG}" | sed 's/^#//' | tr -cd '[:alnum:]_-')

BACKUP_DIR="${HOME}/backups/uno-kawihe"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -n "${TAG_CLEAN}" ] && [ -f "${BACKUP_DIR}/LATEST_BACKUP_${TAG_CLEAN}.txt" ]; then
  BACKUP_FILE=$(cat "${BACKUP_DIR}/LATEST_BACKUP_${TAG_CLEAN}.txt")
  echo "🎯 Restaurando backup com a tag #${TAG_CLEAN}..."
elif [ -n "${TAG_CLEAN}" ] && [ -f "${TAG}" ]; then
  BACKUP_FILE="${TAG}"
elif [ -f "${BACKUP_DIR}/LATEST_BACKUP.txt" ]; then
  BACKUP_FILE=$(cat "${BACKUP_DIR}/LATEST_BACKUP.txt")
  echo "🎯 Restaurando último backup geral..."
else
  echo "❌ Nenhum arquivo de backup encontrado em ${BACKUP_DIR}."
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Arquivo não encontrado: ${BACKUP_FILE}"
  exit 1
fi

echo "📦 Restaurando de: ${BACKUP_FILE} para ${PROJECT_DIR}..."
tar -xzf "${BACKUP_FILE}" -C "${PROJECT_DIR}"

echo "🔄 Reconstruindo contêineres Docker..."
cd "${PROJECT_DIR}"
docker compose up -d --build

echo "================================================================="
echo "✅ RESTAURAÇÃO CONCLUÍDA COM SUCESSO!"
echo "================================================================="
