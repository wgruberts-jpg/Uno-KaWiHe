#!/usr/bin/env bash
# ==============================================================================
# 🚀 UNO KAWIHE - ORACLE CLOUD VM DEPLOY & CHECKPOINT ORCHESTRATOR
# Versão: v2.2.2
# ==============================================================================
# Executa o deploy em etapas com testes automáticos e suporte a retomada.
# Se qualquer etapa falhar, o script para e mantém o ponto de parada.
# ==============================================================================

set -Eeuo pipefail

DEPLOY_VERSION="v2.2.2"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STATE_FILE="/var/tmp/unokawihe_deploy_state"
REPO_URL="https://github.com/wgruberts-jpg/Uno-KaWiHe.git"
INSTALL_DIR="/opt/unokawihe"
TARGET_USER="${SUDO_USER:-$USER}"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_succ() { echo -e "${GREEN}[SUCC]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

get_current_step() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  elif [ -f ".deploy_state" ]; then
    cat ".deploy_state"
  else
    echo "0"
  fi
}

set_current_step() {
  echo "$1" > "$STATE_FILE"
  rm -f ".deploy_state" 2>/dev/null || true
}

trap 'on_error $? $LINENO' ERR
on_error() {
  log_err "Falha na linha $2 (Código: $1). Corrija e reexecute o comando para continuar da etapa salva."
  exit "$1"
}

# ==============================================================================
# ETAPA 1: Sistema & Swap (Otimizado para 1GB RAM - OCI Micro)
# ==============================================================================
step_1_system_prep() {
  log_info "=== [ETAPA 1/6] Sistema Operacional & Swap ==="

  sudo apt-get update -y
  sudo apt-get install -y curl git jq ca-certificates

  if [ ! -f /swapfile ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
    log_info "Criando Swap de 2GB para estabilidade na VM Micro (1GB RAM)..."
    sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    log_succ "Swap de 2GB criado."
  else
    log_info "Swap já configurado ou ativo."
  fi

  if [ -f /swapfile ] || [ "$(swapon --show | wc -l)" -gt 0 ]; then
    log_succ "Teste Etapa 1 OK: Dependências e memória virtual ativos."
  else
    log_err "Teste Etapa 1 Falhou: Swap não detectado."
    exit 1
  fi

  set_current_step 1
}

# ==============================================================================
# ETAPA 2: Docker & Docker Compose
# ==============================================================================
step_2_docker_install() {
  log_info "=== [ETAPA 2/6] Docker & Docker Compose ==="

  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    sudo usermod -aG docker "$TARGET_USER" || true
    rm -f /tmp/get-docker.sh
  else
    log_info "Docker já instalado."
  fi

  if ! docker compose version &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
  else
    log_info "Docker Compose já instalado."
  fi

  if docker --version && docker compose version; then
    log_succ "Teste Etapa 2 OK: Docker e Docker Compose operacionais."
  else
    log_err "Teste Etapa 2 Falhou: Docker não responde."
    exit 1
  fi

  set_current_step 2
}

# ==============================================================================
# ETAPA 3: Clone / Sincronização via Git Oficial
# ==============================================================================
step_3_git_sync() {
  log_info "=== [ETAPA 3/6] Sincronização do Código via Git ==="

  if [ -d "$INSTALL_DIR/.git" ]; then
    log_info "Atualizando repositório existente em $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git config --global --add safe.directory "$INSTALL_DIR" || true
    git config core.fileMode false || true
    git fetch origin --tags
    git checkout -- *.sh scripts/*.sh Dockerfile 2>/dev/null || true
    git pull --ff-only origin main || git pull --ff-only origin master || git reset --hard origin/main || git reset --hard origin/master
    log_info "Commit ativo: $(git rev-parse --short HEAD) ($(git describe --tags --always 2>/dev/null || echo "${DEPLOY_VERSION}"))"
  else
    if [ -d "$INSTALL_DIR" ]; then
      log_warn "Diretório $INSTALL_DIR existe sem repositório Git válido. Limpando para clonar..."
      sudo rm -rf "$INSTALL_DIR"
    fi
    log_info "Clonando repositório oficial em $INSTALL_DIR..."
    sudo git clone "$REPO_URL" "$INSTALL_DIR"
    sudo chown -R "$TARGET_USER:$TARGET_USER" "$INSTALL_DIR" || true
    cd "$INSTALL_DIR"
  fi

  # Teste rigoroso da Etapa 3
  if [ -f "$INSTALL_DIR/package.json" ] && [ -f "$INSTALL_DIR/Dockerfile" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
    log_succ "Teste Etapa 3 OK: package.json, Dockerfile e docker-compose.yml verificados."
  else
    log_err "Teste Etapa 3 Falhou: Arquivos essenciais não encontrados em $INSTALL_DIR."
    exit 1
  fi

  set_current_step 3
}

# ==============================================================================
# ETAPA 4: Firewall & Portas (Porta 3000, 80, 443)
# ==============================================================================
step_4_firewall() {
  log_info "=== [ETAPA 4/6] Liberação de Portas (22, 80, 443, 3000) ==="

  if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 3000/tcp || true
    log_succ "Regras aplicadas no UFW."
  elif command -v iptables &> /dev/null; then
    for port in 80 443 3000; do
      if ! sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
        sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT || true
      fi
    done
    log_succ "Regras aplicadas no iptables (Lembre-se de liberar a porta 3000 também na Security List da Oracle Cloud!)."
  else
    log_warn "Nenhum firewall local ativo detectado."
  fi

  set_current_step 4
}

# ==============================================================================
# ETAPA 5: Configuração (.env, permissões) & Build Docker Compose
# ==============================================================================
step_5_docker_build() {
  log_info "=== [ETAPA 5/6] Configuração, Build & Execução Docker ==="

  cd "$INSTALL_DIR"
  chmod +x *.sh scripts/*.sh 2>/dev/null || true

  # Garantir pasta data com permissão de escrita para o usuário node (UID 1000)
  mkdir -p "$INSTALL_DIR/data"
  sudo chown -R 1000:1000 "$INSTALL_DIR/data"

  # Criar .env seguro caso não exista
  if [ ! -f "$INSTALL_DIR/.env" ]; then
    log_info "Gerando arquivo .env com JWT_SECRET aleatório..."
    RAND_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    cat > "$INSTALL_DIR/.env" <<EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=${RAND_SECRET}
DATA_DIR=./data
EOF
    chmod 600 "$INSTALL_DIR/.env"
  fi

  log_info "Parando containers antigos para liberar RAM antes do build..."
  sudo docker compose down --remove-orphans || true

  log_info "Construindo serviços sequencialmente (otimizado para VM Micro 1GB RAM)..."
  sudo docker compose build kawihe-auth
  sudo docker compose build uno-game
  sudo docker compose up -d --no-build

  if [ "$(sudo docker compose ps -q | wc -l)" -gt 0 ]; then
    log_succ "Teste Etapa 5 OK: Containers ativos no Docker Compose."
  else
    log_err "Teste Etapa 5 Falhou: Nenhum container ativo."
    exit 1
  fi

  set_current_step 5
}

# ==============================================================================
# ETAPA 6: Health Check Final (com retentativas para VM Micro)
# ==============================================================================
step_6_health_check() {
  log_info "=== [ETAPA 6/6] Verificação de Saúde (Health Check) ==="

  HTTP_STATUS="000"
  for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
    if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 304 ] || [ "$HTTP_STATUS" -eq 404 ]; then
      break
    fi
    log_info "Aguardando servidor Node responder... ($i/15)"
    sleep 2
  done

  if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 304 ] || [ "$HTTP_STATUS" -eq 404 ]; then
    PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "<IP_DA_SUA_VM>")
    APP_PKG_VERSION=$(jq -r '.version // "2.2.1"' "$INSTALL_DIR/package.json" 2>/dev/null || echo "${DEPLOY_VERSION}")
    log_succ "🎉 DEPLOY ${DEPLOY_VERSION} (App v${APP_PKG_VERSION}) CONCLUÍDO COM SUCESSO! HTTP Status: $HTTP_STATUS"
    echo "===================================================================="
    echo "🏷️  Versão do Deploy: ${DEPLOY_VERSION} | App: v${APP_PKG_VERSION}"
    echo "🌐 Acesse o jogo em: http://${PUBLIC_IP}:3000"
    echo "📂 Instalado em: ${INSTALL_DIR}"
    echo "⚠️  Na Oracle Cloud, lembre-se de liberar TCP 3000 na Ingress Rule (VCN)."
    echo "===================================================================="
    rm -f "$STATE_FILE" ".deploy_state"
  else
    log_err "Teste Etapa 6 Falhou: Servidor na porta 3000 retornou HTTP Status $HTTP_STATUS"
    log_info "Logs recentes do container:"
    sudo docker compose -f "$INSTALL_DIR/docker-compose.yml" logs --tail=30 || true
    exit 1
  fi
}

main() {
  CURRENT_STEP=$(get_current_step)
  log_info "🚀 Uno KaWiHe Deploy ${DEPLOY_VERSION} — Iniciando/Retomando da etapa: $CURRENT_STEP/6"

  [ "$CURRENT_STEP" -lt 1 ] && step_1_system_prep
  [ "$CURRENT_STEP" -lt 2 ] && step_2_docker_install
  if [ "$CURRENT_STEP" -lt 3 ] || [ -d "$INSTALL_DIR/.git" ]; then
    step_3_git_sync
  fi
  [ "$CURRENT_STEP" -lt 4 ] && step_4_firewall
  [ "$CURRENT_STEP" -lt 5 ] && step_5_docker_build
  [ "$CURRENT_STEP" -lt 6 ] && step_6_health_check
}

main "$@"
