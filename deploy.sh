#!/usr/bin/env bash
# ==============================================================================
# 🚀 UNO KAWIHE - ORACLE CLOUD VM DEPLOY & CHECKPOINT ORCHESTRATOR
# ==============================================================================
# Executa o deploy em etapas com testes automáticos e suporte a retomada.
# Se qualquer etapa falhar, o script para, permitindo correção e retomada posterior.
# ==============================================================================

set -Eeuo pipefail

# Cores para logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

STATE_FILE=".deploy_state"
REPO_URL="https://github.com/wgruberts-jpg/Uno-KaWiHe.git"
INSTALL_DIR="/opt/unokawihe"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_succ() { echo -e "${GREEN}[SUCC]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# Funções de Controle de Estado (Checkpoints)
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

# Tratamento de Erros
trap 'on_error $? $LINENO' ERR

on_error() {
  local exit_code=$1
  local line_no=$2
  log_err "Falha na execução na linha ${line_no} (Código de saída: ${exit_code})."
  log_warn "O deploy foi pausado. Corrija o problema e execute './deploy.sh' novamente para continuar do ponto de parada."
  exit "$exit_code"
}

# ==============================================================================
# ETAPA 1: Preparação do Sistema & Swap (Otimizado para 1GB RAM - OCI Micro)
# ==============================================================================
step_1_system_prep() {
  log_info "=== [ETAPA 1/6] Preparação do Sistema Operacional & Swap ==="
  
  if [ "$(id -u)" -ne 0 ]; then
    log_warn "Recomenda-se executar como root (sudo) para instalar dependências do sistema."
  fi

  # Atualizar pacotes básicos
  sudo apt-get update -y
  sudo apt-get install -y curl git ufw jq rsync

  # Configurar Swap de 2GB se não existir (Vital para 1GB RAM)
  if [ ! -f /swapfile ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
    log_info "Criando arquivo Swap de 2GB para evitar OOM Killer..."
    sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    log_succ "Swap de 2GB configurado com sucesso."
  else
    log_info "Swap já configurado ou ativo."
  fi

  # Teste da Etapa 1
  if [ -f /swapfile ] || [ "$(swapon --show | wc -l)" -gt 0 ]; then
    log_succ "Teste Etapa 1 OK: Sistema pronto e memória virtual ativa."
  else
    log_err "Teste Etapa 1 Falhou: Swap não detectado."
    exit 1
  fi

  set_current_step 1
}

# ==============================================================================
# ETAPA 2: Instalação do Docker & Docker Compose
# ==============================================================================
step_2_docker_install() {
  log_info "=== [ETAPA 2/6] Instalação do Docker e Docker Compose ==="

  if ! command -v docker &> /dev/null; then
    log_info "Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
  else
    log_info "Docker já está instalado."
  fi

  if ! docker compose version &> /dev/null; then
    log_info "Instalando Docker Compose Plugin..."
    sudo apt-get install -y docker-compose-plugin
  else
    log_info "Docker Compose já está instalado."
  fi

  # Teste da Etapa 2
  if docker --version && docker compose version; then
    log_succ "Teste Etapa 2 OK: Docker e Docker Compose operacionais."
  else
    log_err "Teste Etapa 2 Falhou: Binários do Docker não respondem."
    exit 1
  fi

  set_current_step 2
}

# ==============================================================================
# ETAPA 3: Obtenção / Atualização do Código do Jogo (Git)
# ==============================================================================
step_3_git_sync() {
  log_info "=== [ETAPA 3/6] Sincronização do Código (Git) ==="

  if [ -d ".git" ]; then
    log_info "Repositório local detectado. Executando git pull..."
    git pull origin main || git pull origin master || true
  else
    log_info "Configurando diretório de instalação em $INSTALL_DIR..."
    if [ ! -d "$INSTALL_DIR" ]; then
      sudo mkdir -p "$INSTALL_DIR"
      sudo chown -R $USER:$USER "$INSTALL_DIR"
    fi
    if [ "$(pwd)" != "$INSTALL_DIR" ]; then
      log_info "Copiando arquivos atuais para $INSTALL_DIR..."
      rsync -av --exclude 'node_modules' --exclude '.git' ./ "$INSTALL_DIR/"
      cd "$INSTALL_DIR"
    fi
  fi

  # Teste da Etapa 3
  if [ -f "package.json" ] && [ -f "Dockerfile" ]; then
    log_succ "Teste Etapa 3 OK: Arquivos do projeto verificados."
  else
    log_err "Teste Etapa 3 Falhou: package.json ou Dockerfile ausentes."
    exit 1
  fi

  set_current_step 3
}

# ==============================================================================
# ETAPA 4: Configuração de Firewall & Portas (Porta 3000)
# ==============================================================================
step_4_firewall() {
  log_info "=== [ETAPA 4/6] Configuração de Portas e Firewall (UFW) ==="

  if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp || true
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 3000/tcp || true
    sudo ufw --force enable || true
    log_succ "Regras de firewall aplicadas (Portas 22, 80, 443, 3000 abertas)."
  else
    log_warn "UFW não encontrado, pulando configuração de firewall local."
  fi

  set_current_step 4
}

# ==============================================================================
# ETAPA 5: Build & Execução via Docker Compose
# ==============================================================================
step_5_docker_build() {
  log_info "=== [ETAPA 5/6] Build e Inicialização dos Containers ==="

  chmod +x *.sh scripts/*.sh 2>/dev/null || true

  log_info "Construindo e subindo container otimizado para 1GB RAM..."
  docker compose down --remove-orphans || true
  docker compose up -d --build

  # Teste da Etapa 5
  if [ "$(docker compose ps -q | wc -l)" -gt 0 ]; then
    log_succ "Teste Etapa 5 OK: Container Docker iniciado com sucesso."
  else
    log_err "Teste Etapa 5 Falhou: Nenhum container ativo no Docker Compose."
    exit 1
  fi

  set_current_step 5
}

# ==============================================================================
# ETAPA 6: Health Check Final (Teste HTTP na porta 3000)
# ==============================================================================
step_6_health_check() {
  log_info "=== [ETAPA 6/6] Verificação de Saúde (Health Check) ==="

  log_info "Aguardando 5 segundos para inicialização do servidor Node..."
  sleep 5

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")

  if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 304 ] || [ "$HTTP_STATUS" -eq 404 ]; then
    log_succ "🎉 DEPLOY CONCLUÍDO COM SUCESSO! O servidor respondeu com status HTTP $HTTP_STATUS."
    echo "===================================================================="
    echo "🌐 Acesse o seu jogo em: http://<IP_DA_SUA_VM>:3000"
    echo "===================================================================="
    set_current_step 6
    rm -f "$STATE_FILE"
  else
    log_err "Teste Etapa 6 Falhou: O servidor na porta 3000 retornou HTTP status $HTTP_STATUS."
    log_info "Execute 'docker compose logs --tail=50' para inspecionar o erro."
    exit 1
  fi
}

# ==============================================================================
# ORQUESTRADOR PRINCIPAL (COM SUPORTE A RETOMADA / RESUME)
# ==============================================================================
main() {
  CURRENT_STEP=$(get_current_step)
  log_info "Iniciando orquestrador de deploy. Etapa atual salva: $CURRENT_STEP/6"

  if [ "$CURRENT_STEP" -lt 1 ]; then
    step_1_system_prep
  fi

  if [ "$CURRENT_STEP" -lt 2 ]; then
    step_2_docker_install
  fi

  if [ "$CURRENT_STEP" -lt 3 ]; then
    step_3_git_sync
  fi

  if [ "$CURRENT_STEP" -lt 4 ]; then
    step_4_firewall
  fi

  if [ "$CURRENT_STEP" -lt 5 ]; then
    step_5_docker_build
  fi

  if [ "$CURRENT_STEP" -lt 6 ]; then
    step_6_health_check
  fi
}

main "$@"
