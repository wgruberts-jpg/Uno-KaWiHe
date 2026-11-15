#!/usr/bin/env bash
# ==============================================================================
# 🚀 UNO KAWIHE - ORACLE CLOUD VM DEPLOY & CHECKPOINT ORCHESTRATOR
# ==============================================================================
# Executa o deploy em etapas com testes automáticos e suporte a retomada.
# ==============================================================================

set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STATE_FILE=".deploy_state"
REPO_URL="https://github.com/wgruberts-jpg/Uno-KaWiHe.git"
INSTALL_DIR="/opt/unokawihe"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_succ() { echo -e "${GREEN}[SUCC]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

get_current_step() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo "0"
  fi
}

set_current_step() {
  echo "$1" > "$STATE_FILE"
}

trap 'on_error $? $LINENO' ERR
on_error() {
  log_err "Falha na linha $2 (Código: $1). Corrija e reexecute ./deploy.sh"
  exit "$1"
}

# ==============================================================================
# ETAPA 1: Sistema & Swap (Otimizado para 1GB RAM - OCI Micro)
# ==============================================================================
step_1_system_prep() {
  log_info "=== [ETAPA 1/6] Sistema Operacional & Swap ==="
  
  sudo apt-get update -y
  sudo apt-get install -y curl git ufw jq

  if [ ! -f /swapfile ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
    log_info "Criando Swap de 2GB..."
    sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    log_succ "Swap de 2GB criado."
  fi

  set_current_step 1
}

# ==============================================================================
# ETAPA 2: Docker & Docker Compose
# ==============================================================================
step_2_docker_install() {
  log_info "=== [ETAPA 2/6] Docker & Docker Compose ==="

  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
  fi

  if ! docker compose version &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
  fi

  set_current_step 2
}

# ==============================================================================
# ETAPA 3: Clone / Sincronização via Git Oficial
# ==============================================================================
step_3_git_sync() {
  log_info "=== [ETAPA 3/6] Sincronização do Código via Git ==="

  sudo mkdir -p "$INSTALL_DIR"
  sudo chown -R $USER:$USER "$INSTALL_DIR"

  if [ -d "$INSTALL_DIR/.git" ]; then
    log_info "Atualizando repositório existente em $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull origin main || git pull origin master || true
  else
    log_info "Clonando repositório oficial em $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  # Teste rigoroso da Etapa 3
  if [ -f "package.json" ] && [ -f "Dockerfile" ]; then
    log_succ "Teste Etapa 3 OK: package.json e Dockerfile encontrados."
  else
    log_err "Teste Etapa 3 Falhou: Arquivos essenciais não encontrados no diretório de instalação."
    exit 1
  fi

  set_current_step 3
}

# ==============================================================================
# ETAPA 4: Firewall (Porta 3000)
# ==============================================================================
step_4_firewall() {
  log_info "=== [ETAPA 4/6] Firewall (UFW) ==="

  if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 3000/tcp || true
    sudo ufw --force enable || true
    log_succ "Portas liberadas no UFW."
  fi

  set_current_step 4
}

# ==============================================================================
# ETAPA 5: Build & Execução (Docker Compose)
# ==============================================================================
step_5_docker_build() {
  log_info "=== [ETAPA 5/6] Build & Execução Docker ==="

  cd "$INSTALL_DIR"
  chmod +x *.sh scripts/*.sh 2>/dev/null || true

  docker compose down --remove-orphans || true
  docker compose up -d --build

  if [ "$(docker compose ps -q | wc -l)" -gt 0 ]; then
    log_succ "Teste Etapa 5 OK: Container ativo."
  else
    log_err "Teste Etapa 5 Falhou: Container não iniciou."
    exit 1
  fi

  set_current_step 5
}

# ==============================================================================
# ETAPA 6: Health Check Final
# ==============================================================================
step_6_health_check() {
  log_info "=== [ETAPA 6/6] Health Check ==="

  sleep 5
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")

  if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 304 ] || [ "$HTTP_STATUS" -eq 404 ]; then
    log_succ "🎉 DEPLOY CONCLUÍDO COM SUCESSO! HTTP Status: $HTTP_STATUS"
    echo "===================================================================="
    echo "🌐 Acesse em: http://<IP_DA_SUA_VM>:3000"
    echo "===================================================================="
    rm -f "$STATE_FILE"
  else
    log_err "Teste Etapa 6 Falhou: HTTP Status $HTTP_STATUS"
    exit 1
  fi
}

main() {
  CURRENT_STEP=$(get_current_step)
  log_info "Retomando deploy a partir da etapa: $CURRENT_STEP/6"

  [ "$CURRENT_STEP" -lt 1 ] && step_1_system_prep
  [ "$CURRENT_STEP" -lt 2 ] && step_2_docker_install
  [ "$CURRENT_STEP" -lt 3 ] && step_3_git_sync
  [ "$CURRENT_STEP" -lt 4 ] && step_4_firewall
  [ "$CURRENT_STEP" -lt 5 ] && step_5_docker_build
  [ "$CURRENT_STEP" -lt 6 ] && step_6_health_check
}

main "$@"
