#!/usr/bin/env bash
# ==============================================================================
# 🧹 SCRIPT DE LIMPEZA E REVERSÃO DO DEPLOY NO PC LOCAL
# ==============================================================================
# Execute com: sudo ./limpar.sh (ou bash limpar.sh)
# ==============================================================================

set -e

echo "[INFO] Iniciando limpeza e restauração do PC local..."

# 1. Remover pasta criada em /opt
if [ -d "/opt/unokawihe" ]; then
  echo "[INFO] Removendo /opt/unokawihe..."
  rm -rf /opt/unokawihe
fi

# 2. Desativar e remover swapfile se foi criado
if [ -f "/swapfile" ]; then
  echo "[INFO] Desativando e removendo arquivo swap (/swapfile)..."
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  # Remover entrada do /fstab se existir
  sed -i '\|\/swapfile|d' /etc/fstab 2>/dev/null || true
fi

# 3. Remover arquivo de estado do deploy local
if [ -f ".deploy_state" ]; then
  echo "[INFO] Removendo .deploy_state..."
  rm -f .deploy_state
fi

echo "[SUCC] Limpeza concluída com sucesso! Seu PC foi restaurado ao estado original."
