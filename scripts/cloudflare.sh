#!/usr/bin/env bash
# ==============================================================================
# Script de Gerenciamento do Cloudflare Tunnel (HTTPS) para UNO KaWiHe
# Permite Ativar, Ver Link, Parar e Desinstalar o túnel Cloudflare facilmente.
# ==============================================================================

# Cores para o terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

mostrar_banner() {
  clear
  echo -e "${YELLOW}=================================================================${NC}"
  echo -e "${BOLD}${YELLOW}   ☁️  GERENCIADOR CLOUDFLARE TUNNEL - UNO KAWIHE (HTTPS)   ${NC}"
  echo -e "${YELLOW}=================================================================${NC}"
  echo ""
}

obter_link_tunnel() {
  local link=""
  for i in {1..12}; do
    link=$(docker logs uno-tunnel 2>&1 | grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' | tail -n 1)
    if [ -n "$link" ]; then
      break
    fi
    sleep 1
  done
  echo "$link"
}

fazer_backup_seguranca() {
  mostrar_banner
  echo -e "${YELLOW}💾 Executando backup com a tag #antescloudflare...${NC}"
  echo ""
  local script_backup="./scripts/backup.sh"
  
  if [ -f "$script_backup" ]; then
    bash "$script_backup" antescloudflare
  else
    echo "❌ Erro: Script de backup não encontrado em $script_backup"
    exit 1
  fi
  
  echo ""
  echo -e "${GREEN}✓ Ponto de restauração seguro criado com sucesso!${NC}"
  echo -e "Caso queira restaurar a qualquer momento no futuro, basta rodar:"
  echo -e "${BOLD}${CYAN}bash scripts/restore.sh antescloudflare${NC}"
  echo ""
  read -r -p "Pressione [ENTER] para voltar ao menu..."
}

ativar_cloudflare() {
  mostrar_banner
  echo -e "${CYAN}▶ Verificando status do Cloudflare...${NC}"

  # Se for a primeira inicialização, garante o backup com tag #antescloudflare antes de subir o túnel
  if [ ! -f "${HOME}/backups/uno-kawihe/LATEST_BACKUP_antescloudflare.txt" ]; then
    echo ""
    echo -e "${YELLOW}🛡️  [SEGURANÇA] Criando backup automático com a tag #antescloudflare...${NC}"
    local script_backup="./scripts/backup.sh"
    if [ -f "$script_backup" ]; then
      bash "$script_backup" antescloudflare || true
    fi
    echo ""
  fi

  if docker ps --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    echo -e "${GREEN}✓ O túnel Cloudflare já está em execução!${NC}"
    echo ""
    local link
    link=$(obter_link_tunnel)
    if [ -n "$link" ]; then
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
      echo -e "${BOLD}🔗 SEU LINK HTTPS SEGURO (Microfone Liberado):${NC}"
      echo -e "${BOLD}${YELLOW}👉 ${link}${NC}"
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
    else
      echo -e "${YELLOW}Aguardando o link ser registrado pela Cloudflare...${NC}"
      docker logs --tail 15 uno-tunnel
    fi
  elif docker ps -a --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    echo -e "${YELLOW}Iniciando o túnel Cloudflare existente...${NC}"
    docker start uno-tunnel >/dev/null
    sleep 2
    local link
    link=$(obter_link_tunnel)
    echo -e "${GREEN}✓ Cloudflare iniciado com sucesso!${NC}"
    echo ""
    if [ -n "$link" ]; then
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
      echo -e "${BOLD}🔗 SEU LINK HTTPS SEGURO (Microfone Liberado):${NC}"
      echo -e "${BOLD}${YELLOW}👉 ${link}${NC}"
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
    fi
  else
    echo -e "${YELLOW}Baixando e inicializando o túnel oficial da Cloudflare...${NC}"
    docker run -d --name uno-tunnel --restart unless-stopped --network host cloudflare/cloudflared:latest tunnel --url http://localhost:3000 >/dev/null
    echo -e "${CYAN}Conectando com a rede global Cloudflare e gerando certificado HTTPS...${NC}"
    sleep 3
    local link
    link=$(obter_link_tunnel)
    echo -e "${GREEN}✓ Cloudflare Tunnel ATIVADO com sucesso!${NC}"
    echo ""
    if [ -n "$link" ]; then
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
      echo -e "${BOLD}🔗 SEU LINK HTTPS SEGURO (Microfone Liberado):${NC}"
      echo -e "${BOLD}${YELLOW}👉 ${link}${NC}"
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
      echo -e "${CYAN}Abra este link no celular ou no PC para jogar com áudio liberado!${NC}"
    else
      echo -e "${YELLOW}Túnel iniciado! Se o link não apareceu acima, execute a opção [2] em alguns segundos.${NC}"
    fi
  fi
  echo ""
  read -r -p "Pressione [ENTER] para voltar ao menu..."
}

status_link() {
  mostrar_banner
  echo -e "${CYAN}▶ Consultando status do túnel...${NC}"
  if docker ps --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    local link
    link=$(obter_link_tunnel)
    echo -e "${GREEN}✓ STATUS: ATIVO E RODANDO${NC}"
    echo ""
    if [ -n "$link" ]; then
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
      echo -e "${BOLD}🔗 SEU LINK HTTPS ATUAL:${NC}"
      echo -e "${BOLD}${YELLOW}👉 ${link}${NC}"
      echo -e "${BOLD}${GREEN}=================================================================${NC}"
    else
      echo -e "${YELLOW}O túnel está ativo, consultando logs recentes:${NC}"
      docker logs --tail 15 uno-tunnel
    fi
  elif docker ps -a --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    echo -e "${YELLOW}⏸ STATUS: PARADO (O container existe, mas não está rodando).${NC}"
    echo -e "Escolha a opção [1] no menu para ativá-lo."
  else
    echo -e "${RED}✗ STATUS: DESINSTALADO / NÃO CRIADO${NC}"
    echo -e "Escolha a opção [1] no menu para criá-lo e ativá-lo."
  fi
  echo ""
  read -r -p "Pressione [ENTER] para voltar ao menu..."
}

parar_cloudflare() {
  mostrar_banner
  echo -e "${YELLOW}▶ Parando o túnel Cloudflare...${NC}"
  if docker ps --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    docker stop uno-tunnel >/dev/null
    echo -e "${GREEN}✓ Cloudflare Tunnel parado com sucesso!${NC}"
  else
    echo -e "${CYAN}O Cloudflare Tunnel já não estava em execução.${NC}"
  fi
  echo ""
  read -r -p "Pressione [ENTER] para voltar ao menu..."
}

desinstalar_cloudflare() {
  mostrar_banner
  echo -e "${RED}⚠️  ATENÇÃO: Desinstalar e Remover Cloudflare${NC}"
  echo -e "Isso vai parar o túnel, remover o container e apagar a imagem do Docker."
  echo ""
  read -r -p "Tem certeza que deseja remover completamente? (s/N): " confirm
  if [[ "$confirm" =~ ^[sS]$ ]]; then
    echo ""
    echo -e "${YELLOW}1/3 Parando container...${NC}"
    docker stop uno-tunnel >/dev/null 2>&1 || true
    echo -e "${YELLOW}2/3 Removendo container...${NC}"
    docker rm uno-tunnel >/dev/null 2>&1 || true
    echo -e "${YELLOW}3/3 Removendo imagem cloudflared...${NC}"
    docker rmi cloudflare/cloudflared:latest >/dev/null 2>&1 || true
    echo ""
    echo -e "${GREEN}✓ Cloudflare Tunnel DESINSTALADO e apagado com sucesso!${NC}"
  else
    echo -e "${CYAN}Operação cancelada. Nada foi alterado.${NC}"
  fi
  echo ""
  read -r -p "Pressione [ENTER] para voltar ao menu..."
}

# Loop principal do Menu
while true; do
  mostrar_banner

  # Status atual em tempo real
  if docker ps --format '{{.Names}}' | grep -q "^uno-tunnel$"; then
    echo -e "Status atual: ${GREEN}● ATIVO (Online)${NC}"
  else
    echo -e "Status atual: ${RED}○ DESATIVADO / PARADO${NC}"
  fi
  echo ""

  echo -e "Escolha uma opção:"
  echo -e "  ${BOLD}1)${NC} ${GREEN}▶ Ativar Cloudflare${NC} (Iniciar túnel e gerar link HTTPS seguro)"
  echo -e "  ${BOLD}2)${NC} ${CYAN}🔍 Ver Link Atual e Status${NC}"
  echo -e "  ${BOLD}3)${NC} ${YELLOW}⏸  Parar Cloudflare${NC} (Pausar o túnel)"
  echo -e "  ${BOLD}4)${NC} ${RED}🗑️  Desinstalar / Remover Cloudflare${NC} (Apagar tudo)"
  echo -e "  ${BOLD}5)${NC} ${BLUE}💾 Fazer Backup de Segurança (#antescloudflare)${NC}"
  echo -e "  ${BOLD}6)${NC} 🚪 Sair"
  echo ""
  read -r -p "Digite o número da opção desejada [1-6]: " opcao

  case $opcao in
    1) ativar_cloudflare ;;
    2) status_link ;;
    3) parar_cloudflare ;;
    4) desinstalar_cloudflare ;;
    5) fazer_backup_seguranca ;;
    6)
      echo ""
      echo -e "${GREEN}Até logo! Bom jogo! 🃏${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}Opção inválida! Pressione Enter para tentar novamente.${NC}"
      read -r
      ;;
  esac
done
