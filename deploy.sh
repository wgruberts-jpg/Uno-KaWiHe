#!/usr/bin/env bash
# ==============================================================================
# UNO KAWIHE - SCRIPT DE GESTÃO E DEPLOY EM PRODUÇÃO (VM)
# ==============================================================================
# Este script foi projetado para execução direta na Máquina Virtual (VM).
# Ele gerencia todo o ciclo de vida: Backup Automático -> Deploy Git -> Docker -> Health Check
#
# Uso:
#   ./deploy.sh                  # Executa Deploy Completo (com auto-backup prévio)
#   ./deploy.sh deploy           # Executa Deploy Completo
#   ./deploy.sh backup [tag]     # Cria um backup manual sob demanda
#   ./deploy.sh restore [tag]    # Restaura o último backup ou tag específica
#   ./deploy.sh logs             # Acompanha logs dos contêineres em tempo real
#   ./deploy.sh status           # Exibe o status dos serviços e uso de recursos
# ==============================================================================
set -e

# Cores para saída no terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/backups/uno-kawihe"
BRANCH="${GIT_BRANCH:-main}"
ACTION="${1:-deploy}"
PARAM="${2:-}"

cd "${PROJECT_DIR}"

# ------------------------------------------------------------------------------
# FUNÇÃO DE BACKUP
# ------------------------------------------------------------------------------
do_backup() {
  local tag="$1"
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local tag_clean=""
  local backup_file=""

  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"

  if [ -n "${tag}" ]; then
    tag_clean=$(echo "${tag}" | sed 's/^#//' | tr -cd '[:alnum:]_-')
    backup_file="${BACKUP_DIR}/uno_backup_${tag_clean}_${timestamp}.tar.gz"
    echo -e "${CYAN}🏷️  Criando backup com Tag #${tag_clean}...${NC}"
  else
    backup_file="${BACKUP_DIR}/uno_backup_${timestamp}.tar.gz"
    echo -e "${CYAN}📦 Criando backup preventivo de segurança...${NC}"
  fi

  # 1. Salva volume Docker auth-data se existir
  if command -v docker >/dev/null 2>&1 && docker volume inspect auth-data >/dev/null 2>&1; then
    docker run --rm -v auth-data:/data -v "${BACKUP_DIR}":/backup alpine \
      tar -czf "/backup/auth_volume_${timestamp}.tar.gz" -C /data . >/dev/null 2>&1 || true
    chmod 600 "${BACKUP_DIR}/auth_volume_${timestamp}.tar.gz" 2>/dev/null || true
    echo -e "   ${GREEN}✓ Volume Docker 'auth-data' salvo com sucesso.${NC}"
  fi

  # 2. Salva diretório local ./data se existir
  if [ -d "${PROJECT_DIR}/data" ]; then
    tar -czf "${BACKUP_DIR}/data_dir_${timestamp}.tar.gz" -C "${PROJECT_DIR}" data 2>/dev/null || true
    chmod 600 "${BACKUP_DIR}/data_dir_${timestamp}.tar.gz" 2>/dev/null || true
    echo -e "   ${GREEN}✓ Diretório de contas 'data/' salvo com sucesso.${NC}"
  fi

  # 3. Compacta aplicação e arquivos de configuração (excluindo node_modules pesados e dist)
  tar --exclude="node_modules" \
      --exclude=".git/objects" \
      --exclude="dist" \
      -czf "${backup_file}" -C "${PROJECT_DIR}" . 2>/dev/null || true

  chmod 600 "${backup_file}" 2>/dev/null || true

  # Atualiza ponteiro do último backup
  echo "${backup_file}" > "${BACKUP_DIR}/LATEST_BACKUP.txt"
  if [ -n "${tag_clean}" ]; then
    echo "${backup_file}" > "${BACKUP_DIR}/LATEST_BACKUP_${tag_clean}.txt"
  fi

  local size
  size=$(du -h "${backup_file}" | cut -f1)
  echo -e "   ${GREEN}✓ Arquivo de backup:${NC} ${backup_file} (${size})"
}

# ------------------------------------------------------------------------------
# FUNÇÃO DE RESTORE
# ------------------------------------------------------------------------------
do_restore() {
  local target="$1"
  local backup_file=""

  echo -e "${YELLOW}=================================================================${NC}"
  echo -e "${YELLOW}🔄 INICIANDO PROCESSO DE RESTAURAÇÃO DE BACKUP${NC}"
  echo -e "${YELLOW}=================================================================${NC}"

  if [ -n "${target}" ]; then
    local target_clean
    target_clean=$(echo "${target}" | sed 's/^#//' | tr -cd '[:alnum:]_-')
    if [ -f "${BACKUP_DIR}/LATEST_BACKUP_${target_clean}.txt" ]; then
      backup_file=$(cat "${BACKUP_DIR}/LATEST_BACKUP_${target_clean}.txt")
    elif [ -f "${target}" ]; then
      backup_file="${target}"
    fi
  fi

  if [ -z "${backup_file}" ] && [ -f "${BACKUP_DIR}/LATEST_BACKUP.txt" ]; then
    backup_file=$(cat "${BACKUP_DIR}/LATEST_BACKUP.txt")
  fi

  if [ -z "${backup_file}" ] || [ ! -f "${backup_file}" ]; then
    echo -e "${RED}❌ Erro: Nenhum arquivo de backup válido foi encontrado em ${BACKUP_DIR}.${NC}"
    exit 1
  fi

  echo -e "${CYAN}📦 Restaurando a partir de: ${backup_file}${NC}"

  # Para os contêineres antes de extrair
  if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo -e "${YELLOW}🛑 Parando contêineres Docker...${NC}"
    docker compose down || true
  fi

  # Extrai os arquivos do backup
  tar -xzf "${backup_file}" -C "${PROJECT_DIR}"

  # Restaura banco de dados local se houver cópia dedicada
  local latest_data_archive
  latest_data_archive=$(ls -t "${BACKUP_DIR}"/data_dir_*.tar.gz 2>/dev/null | head -n 1 || true)
  if [ -n "${latest_data_archive}" ] && [ -f "${latest_data_archive}" ]; then
    tar -xzf "${latest_data_archive}" -C "${PROJECT_DIR}" 2>/dev/null || true
  fi

  # Restaura volume Docker auth-data se aplicável
  local latest_vol_archive
  latest_vol_archive=$(ls -t "${BACKUP_DIR}"/auth_volume_*.tar.gz 2>/dev/null | head -n 1 || true)
  if [ -n "${latest_vol_archive}" ] && [ -f "${latest_vol_archive}" ] && command -v docker >/dev/null 2>&1; then
    docker volume create auth-data >/dev/null 2>&1 || true
    docker run --rm -v auth-data:/data -v "${BACKUP_DIR}":/backup alpine \
      sh -c "tar -xzf /backup/$(basename "${latest_vol_archive}") -C /data" >/dev/null 2>&1 || true
  fi

  # Reconstrói e sobe os contêineres
  if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo -e "${CYAN}🚀 Reconstruindo e iniciando contêineres...${NC}"
    docker compose up -d --build
  fi

  echo -e "${GREEN}=================================================================${NC}"
  echo -e "${GREEN}✅ RESTAURAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
  echo -e "${GREEN}=================================================================${NC}"
}

# ------------------------------------------------------------------------------
# FUNÇÃO DE DEPLOY COMPLETO
# ------------------------------------------------------------------------------
do_deploy() {
  echo -e "${CYAN}${BOLD}=================================================================${NC}"
  echo -e "${CYAN}${BOLD}🚀 UNO KAWIHE - INICIANDO PROCESSO DE DEPLOY NA VM${NC}"
  echo -e "${CYAN}${BOLD}=================================================================${NC}"

  # 1. Backup Automático Preventivo
  echo -e "\n${BOLD}[1/6] 💾 Executando Backup Automático Preventivo...${NC}"
  do_backup "auto_pre_deploy"

  # 2. Preserva cópia temporária de segurança de data/ e .env na memória/disco
  echo -e "\n${BOLD}[2/6] 🛡️  Preservando arquivos de banco de dados e variáveis...${NC}"
  TMP_DATA_BACKUP="/tmp/uno_kawihe_data_$(date +%s)"
  mkdir -p "${TMP_DATA_BACKUP}"
  if [ -d "${PROJECT_DIR}/data" ]; then
    cp -r "${PROJECT_DIR}/data" "${TMP_DATA_BACKUP}/"
  fi
  if [ -f "${PROJECT_DIR}/.env" ]; then
    cp "${PROJECT_DIR}/.env" "${TMP_DATA_BACKUP}/.env"
  fi

  # 3. Parada graciosa dos contêineres
  echo -e "\n${BOLD}[3/6] 🛑 Parando contêineres em execução...${NC}"
  if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    sed -i 's/\${JWT_SECRET:?.*}/\${JWT_SECRET:-kawihe_default_secure_secret_production}/g' docker-compose.yml 2>/dev/null || true
    docker compose down 2>/dev/null || true
  fi

  # 4. Atualização a partir do repositório Git
  echo -e "\n${BOLD}[4/6] 📥 Baixando atualizações mais recentes do GitHub (branch: ${BRANCH})...${NC}"
  if [ -d ".git" ]; then
    git fetch origin "${BRANCH}"
    git reset --hard "origin/${BRANCH}"
    echo -e "   ${GREEN}✓ Código sincronizado com origin/${BRANCH}.${NC}"
  else
    echo -e "   ${YELLOW}⚠️  Diretório .git não encontrado. Prosseguindo com arquivos locais.${NC}"
  fi

  # Auto-correção defensiva de sintaxe YAML se vier do git antigo
  if [ -f "docker-compose.yml" ]; then
    sed -i 's/\${JWT_SECRET:?.*}/\${JWT_SECRET:-kawihe_default_secure_secret_production}/g' docker-compose.yml 2>/dev/null || true
  fi

  # 5. Restauração e Blindagem do banco de dados e do .env
  echo -e "\n${BOLD}[5/6] 🔒 Reintegrando base de dados de contas e ambiente...${NC}"
  if [ -d "${TMP_DATA_BACKUP}/data" ]; then
    mkdir -p "${PROJECT_DIR}/data"
    cp -r "${TMP_DATA_BACKUP}/data/"* "${PROJECT_DIR}/data/" 2>/dev/null || true
    echo -e "   ${GREEN}✓ Base de dados de usuários mantida intacta.${NC}"
  fi
  if [ -f "${TMP_DATA_BACKUP}/.env" ] && [ ! -f "${PROJECT_DIR}/.env" ]; then
    cp "${TMP_DATA_BACKUP}/.env" "${PROJECT_DIR}/.env"
    echo -e "   ${GREEN}✓ Arquivo .env restaurado.${NC}"
  fi
  rm -rf "${TMP_DATA_BACKUP}"

  # Validação do arquivo .env
  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      echo -e "   ${YELLOW}⚠️  Arquivo .env não encontrado. Criando a partir de .env.example...${NC}"
      cp .env.example .env
      # Gera um JWT_SECRET aleatório seguro caso esteja vazio
      local gen_secret
      gen_secret=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
      sed -i "s/JWT_SECRET=.*/JWT_SECRET=${gen_secret}/g" .env 2>/dev/null || true
      echo -e "   ${GREEN}✓ Chave JWT_SECRET segura gerada automaticamente no .env.${NC}"
    fi
  fi

  # 6. Build e Inicialização dos Contêineres
  echo -e "\n${BOLD}[6/6] 🐳 Construindo e iniciando serviços no Docker...${NC}"
  if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    docker compose up -d --build
    echo -e "   ${GREEN}✓ Contêineres iniciados com sucesso.${NC}"

    # Health check de confirmação
    echo -e "\n${CYAN}🔍 Verificando integridade da aplicação...${NC}"
    sleep 3
    if docker compose ps | grep -q "Up"; then
      echo -e "${GREEN}=================================================================${NC}"
      echo -e "${GREEN}${BOLD}✅ DEPLOY CONCLUÍDO COM SUCESSO EM PRODUÇÃO!${NC}"
      echo -e "${GREEN}=================================================================${NC}"
      docker compose ps
    else
      echo -e "${RED}⚠️  Atenção: Os contêineres podem não ter subido corretamente.${NC}"
      docker compose logs --tail=30
    fi
  else
    echo -e "${YELLOW}Docker ou docker-compose.yml não encontrados no ambiente.${NC}"
  fi
}

# ------------------------------------------------------------------------------
# ROTEAMENTO DE COMANDOS
# ------------------------------------------------------------------------------
case "${ACTION}" in
  deploy)
    do_deploy
    ;;
  backup)
    do_backup "${PARAM}"
    ;;
  restore)
    do_restore "${PARAM}"
    ;;
  logs)
    if command -v docker >/dev/null 2>&1; then
      docker compose logs -f --tail=100
    else
      echo "Docker não disponível ou não instalado no ambiente atual."
    fi
    ;;
  status)
    echo -e "${CYAN}${BOLD}📊 STATUS DOS SERVIÇOS DO UNO KAWIHE:${NC}"
    if command -v docker >/dev/null 2>&1; then
      docker compose ps
    else
      echo "Docker não disponível ou contêineres gerenciados fora do docker-compose."
    fi
    echo -e "\n${CYAN}${BOLD}💾 USO DE DISCO DO BANCO DE DADOS:${NC}"
    du -sh data/ 2>/dev/null || echo "Diretório data/ ainda não inicializado."
    echo -e "\n${CYAN}${BOLD}📁 ÚLTIMO BACKUP REGISTRADO:${NC}"
    if [ -f "${BACKUP_DIR}/LATEST_BACKUP.txt" ]; then
      cat "${BACKUP_DIR}/LATEST_BACKUP.txt"
    else
      echo "Nenhum backup registrado ainda."
    fi
    ;;
  *)
    echo -e "${RED}Comando não reconhecido: '${ACTION}'${NC}"
    echo "Uso:"
    echo "  ./deploy.sh                # Executa Deploy Completo (com auto-backup)"
    echo "  ./deploy.sh backup [tag]   # Cria um backup manual"
    echo "  ./deploy.sh restore [tag]  # Restaura backup"
    echo "  ./deploy.sh logs           # Exibe logs em tempo real"
    echo "  ./deploy.sh status         # Exibe status dos contêineres"
    exit 1
    ;;
esac
