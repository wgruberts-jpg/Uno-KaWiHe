#!/usr/bin/env bash
# ==============================================================================
# relatorio-vm.sh - Diagnóstico Completo, Reutilizável e Seguro para VM Uno KaWiHe
#
# REGRAS ABSOLUTAS:
# 1. SOMENTE LEITURA: Nenhuma modificação no sistema, git, pacotes ou containers.
# 2. NUNCA IMPRIMIR SEGREDOS: Mascaramento estrito de senhas, JWT, hashes e chaves.
# 3. RESILIÊNCIA TOTAL: Tolerante a falhas (sem 'set -e'), com timeouts em todos os comandos.
# 4. PORTÁTIL: Compatível com Ubuntu/Debian (x86_64 e aarch64).
# ==============================================================================

# Definições Padrão
REPORT_DIR="reports"
MASK_IPS=0
QUICK_MODE=0
MAX_REPORTS=10
DEFAULT_TIMEOUT=10

# Rastreamento de Estado
OVERALL_EXIT_CODE=0
FINDINGS=()
LIMITATIONS=()

# Tratamento de Opções de Linha de Comando
show_help() {
  cat << 'EOF'
Uso: ./relatorio-vm.sh [OPCOES]

Gera relatorio diagnostico completo em Markdown sobre a saude e seguranca da VM Uno KaWiHe.

Opcoes:
  --out DIR       Define diretorio de saida (padrao: reports/)
  --mask-ips      Mascara enderecos IP publicos no relatorio
  --quick         Pula verificacoes demoradas (logs extensos, teste remoto)
  --help          Exibe esta mensagem de ajuda

Codigos de Saida:
  0 = OK (Nenhum problema grave encontrado)
  1 = ATENÇÃO (Avisos operacionais ou melhorias recomendadas)
  2 = CRÍTICO (Problemas criticos de saude ou seguranca)
EOF
  exit 0
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --out)
      if [ -n "$2" ] && [[ "$2" != --* ]]; then
        REPORT_DIR="$2"
        shift 2
      else
        echo "Erro: argumento invalido para --out" >&2
        exit 1
      fi
      ;;
    --mask-ips)
      MASK_IPS=1
      shift
      ;;
    --quick)
      QUICK_MODE=1
      shift
      ;;
    --help|-h)
      show_help
      ;;
    *)
      echo "Opcao desconhecida: $1. Use --help para instrucoes." >&2
      exit 1
      ;;
  esac
done

# Execução Segura com Timeout
run_with_timeout() {
  local to="${1:-$DEFAULT_TIMEOUT}"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$to" "$@" 2>/dev/null
  else
    "$@" 2>/dev/null
  fi
}

# Registro de Achados (CRÍTICO, ATENÇÃO, INFO)
add_finding() {
  local sev="$1"
  local item="$2"
  local why="$3"
  local action="$4"

  if [ "$sev" = "CRÍTICO" ]; then
    OVERALL_EXIT_CODE=2
  elif [ "$sev" = "ATENÇÃO" ] && [ "$OVERALL_EXIT_CODE" -lt 2 ]; then
    OVERALL_EXIT_CODE=1
  fi

  FINDINGS+=("${sev}|${item}|${why}|${action}")
}

# Registro de Limitações (Verificações não concluídas)
add_limitation() {
  local item="$1"
  local reason="$2"
  LIMITATIONS+=("${item}|${reason}")
}

# Filtro Rigoroso de Mascaramento de Segredos
mask_secrets() {
  sed -E \
    -e 's/https:\/\/[^@:]+:[^@]+@/https:\/\/***@/g' \
    -e 's/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/[JWT_MASCARADO]/g' \
    -e 's/\$(2a|2b|2y)\$[0-9]{2}\$[A-Za-z0-9./]{53}/[BCRYPT_MASCARADO]/g' \
    -e 's/\b[a-f0-9]{32,64}\b/[HEX_MASCARADO]/g' \
    -e 's/((password|secret|token|key|senha|jwt)[_a-zA-Z0-9]*[ =:]+)[^ \t\r\n",;>]+/\1[SEGREDO_MASCARADO]/gI' | \
  if [ "$MASK_IPS" -eq 1 ]; then
    if command -v perl >/dev/null 2>&1; then
      perl -pe 's/\b((?!(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0))[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\b/[IP_PUBLICO_MASCARADO]/g'
    else
      sed -E 's/\b([1-9][0-9]{0,2}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\b/[IP_PUBLICO_MASCARADO]/g'
    fi
  else
    cat
  fi
}

# ==============================================================================
# COLETAS DE DIAGNÓSTICO
# ==============================================================================

HOSTNAME_RAW="$(run_with_timeout 3 hostname || echo 'desconhecido')"
TIMESTAMP_UTC="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
TIMESTAMP_LOCAL="$(date '+%Y-%m-%d %H:%M:%S %Z')"
FILE_TIMESTAMP="$(date '+%Y-%m-%d_%H%M%S')"

# 1. Informações do Servidor
OS_NAME="não disponível"
if [ -f /etc/os-release ]; then
  OS_NAME="$(grep -E '^PRETTY_NAME=' /etc/os-release | cut -d= -f2 | tr -d '"')"
elif command -v lsb_release >/dev/null 2>&1; then
  OS_NAME="$(lsb_release -ds 2>/dev/null)"
fi

KERNEL_VER="$(run_with_timeout 3 uname -r || echo 'não disponível')"
ARCH_NAME="$(run_with_timeout 3 uname -m || echo 'não disponível')"
CPU_CORES="$(run_with_timeout 3 nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)"

# RAM
MEM_TOTAL="N/V"
MEM_AVAIL="N/V"
MEM_PERCENT_FREE=100
if [ -f /proc/meminfo ]; then
  MEM_TOTAL_KB="$(grep -E '^MemTotal:' /proc/meminfo | awk '{print $2}')"
  MEM_AVAIL_KB="$(grep -E '^MemAvailable:' /proc/meminfo | awk '{print $2}')"
  if [ -n "$MEM_TOTAL_KB" ] && [ -n "$MEM_AVAIL_KB" ] && [ "$MEM_TOTAL_KB" -gt 0 ]; then
    MEM_TOTAL="$((MEM_TOTAL_KB / 1024)) MB"
    MEM_AVAIL="$((MEM_AVAIL_KB / 1024)) MB"
    MEM_PERCENT_FREE="$(( (MEM_AVAIL_KB * 100) / MEM_TOTAL_KB ))"
    if [ "$MEM_PERCENT_FREE" -lt 8 ]; then
      add_finding "CRÍTICO" "Memória RAM disponível crítica" "Apenas ${MEM_PERCENT_FREE}% da RAM está livre (< 8%). Risco de congelamento por OOM." "Reduzir carga, limitar memória dos containers ou redimensionar a VM."
    elif [ "$MEM_PERCENT_FREE" -lt 15 ]; then
      add_finding "ATENÇÃO" "Memória RAM disponível baixa" "Apenas ${MEM_PERCENT_FREE}% da RAM está livre (< 15%)." "Monitorar processos com maior consumo e ajustar limites no docker-compose.yml."
    fi
  fi
fi

# Swap
SWAP_TOTAL="N/V"
SWAP_USED="N/V"
SWAP_PERCENT_USED=0
if [ -f /proc/meminfo ]; then
  SWAP_TOTAL_KB="$(grep -E '^SwapTotal:' /proc/meminfo | awk '{print $2}')"
  SWAP_FREE_KB="$(grep -E '^SwapFree:' /proc/meminfo | awk '{print $2}')"
  if [ -n "$SWAP_TOTAL_KB" ] && [ -n "$SWAP_FREE_KB" ] && [ "$SWAP_TOTAL_KB" -gt 0 ]; then
    SWAP_USED_KB="$((SWAP_TOTAL_KB - SWAP_FREE_KB))"
    SWAP_PERCENT_USED="$(( (SWAP_USED_KB * 100) / SWAP_TOTAL_KB ))"
    SWAP_TOTAL="$((SWAP_TOTAL_KB / 1024)) MB"
    SWAP_USED="$((SWAP_USED_KB / 1024)) MB (${SWAP_PERCENT_USED}%)"
    if [ "$SWAP_PERCENT_USED" -gt 50 ]; then
      add_finding "ATENÇÃO" "Uso excessivo de Swap" "Swap em uso está em ${SWAP_PERCENT_USED}% (> 50%)." "Verificar processos que estão vazando memória e considerar expansão de RAM."
    fi
  else
    SWAP_TOTAL="0 MB (desativado)"
    SWAP_USED="0 MB"
  fi
fi

# Uptime e Load Average
UPTIME_TEXT="$(run_with_timeout 3 uptime -p 2>/dev/null || uptime 2>/dev/null || echo 'não disponível')"
LOAD_1M="0"
LOAD_5M="0"
LOAD_15M="0"
if [ -f /proc/loadavg ]; then
  LOAD_1M="$(awk '{print $1}' /proc/loadavg)"
  LOAD_5M="$(awk '{print $2}' /proc/loadavg)"
  LOAD_15M="$(awk '{print $3}' /proc/loadavg)"
  LOAD_INT="${LOAD_1M%%.*}"
  if [ -n "$LOAD_INT" ] && [ "$LOAD_INT" -ge "$CPU_CORES" ]; then
    add_finding "ATENÇÃO" "Carga de CPU (Load Average) elevada" "Load 1m (${LOAD_1M}) é maior ou igual ao número de núcleos (${CPU_CORES})." "Investigar processos com alta utilização via 'top' ou 'htop'."
  fi
fi

# Reinício Pendente
REBOOT_REQUIRED="Não"
if [ -f /var/run/reboot-required ] || [ -f /run/reboot-required ]; then
  REBOOT_REQUIRED="Sim (arquivo reboot-required presente)"
  add_finding "ATENÇÃO" "Reinício da VM pendente" "Atualizações de kernel ou pacotes críticos exigem reinício do servidor." "Agendar janela de manutenção para reiniciar o servidor ('sudo reboot')."
fi

# Atualizações de Segurança
SEC_UPDATES="não disponível"
if [ "$QUICK_MODE" -eq 0 ]; then
  if [ -x /usr/lib/update-notifier/apt-check ]; then
    APT_CHECK_OUT="$(/usr/lib/update-notifier/apt-check 2>/dev/null || echo '')"
    if [ -n "$APT_CHECK_OUT" ]; then
      SEC_UPDATES="$(echo "$APT_CHECK_OUT" | cut -d';' -f2 2>/dev/null || echo '0')"
      if [ -n "$SEC_UPDATES" ] && [ "$SEC_UPDATES" -gt 0 ] 2>/dev/null; then
        add_finding "ATENÇÃO" "Atualizações de segurança pendentes" "Existem ${SEC_UPDATES} atualizações de segurança pendentes no sistema operacional." "Executar 'sudo apt update && sudo apt upgrade -y'."
      fi
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    SEC_LINES="$(run_with_timeout 8 apt-get -s upgrade 2>/dev/null | grep -ci 'security' || echo 0)"
    SEC_UPDATES="${SEC_LINES} pacotes relacionados a segurança"
  else
    add_limitation "Atualizações apt" "Gerenciador apt ou apt-check não disponível"
  fi
else
  SEC_UPDATES="ignorado (--quick)"
fi

# Sincronização de Horário e NTP
TIME_SYNC="não disponível"
if command -v timedatectl >/dev/null 2>&1; then
  TIME_SYNC_RAW="$(run_with_timeout 3 timedatectl status 2>/dev/null || echo '')"
  if echo "$TIME_SYNC_RAW" | grep -qi 'synchronized: yes'; then
    TIME_SYNC="Sincronizado (NTP ativo)"
  elif echo "$TIME_SYNC_RAW" | grep -qi 'synchronized: no'; then
    TIME_SYNC="Não sincronizado"
    add_finding "ATENÇÃO" "Relógio do sistema não sincronizado" "NTP inativo. Desvio de horário pode corromper validações de JWT e WebRTC." "Ativar NTP com 'sudo timedatectl set-ntp true'."
  else
    TIME_SYNC="Indeterminado"
  fi
else
  add_limitation "Verificação NTP" "timedatectl não disponível"
fi

# ==============================================================================
# 2. Informações de Disco
# ==============================================================================
DISK_ROWS=""
if command -v df >/dev/null 2>&1; then
  while read -r fs size used avail pcent target; do
    pct_num="${pcent%\%}"
    status_tag="[OK]"
    if [ -n "$pct_num" ] && [ "$pct_num" -ge 90 ] 2>/dev/null; then
      status_tag="[CRÍTICO]"
      add_finding "CRÍTICO" "Partição ${target} quase lotada" "Espaço em disco em ${pcent} (>= 90%). Risco imediato de corrupção." "Executar limpeza urgente de arquivos com 'docker system prune -af' e limpar logs."
    elif [ -n "$pct_num" ] && [ "$pct_num" -ge 80 ] 2>/dev/null; then
      status_tag="[ATENÇÃO]"
      add_finding "ATENÇÃO" "Partição ${target} com espaço reduzido" "Espaço em disco em ${pcent} (>= 80%)." "Planejar limpeza de backups e imagens antes de atingir 90%."
    fi
    DISK_ROWS="${DISK_ROWS}| \`${fs}\` | ${size} | ${used} | ${avail} | ${pcent} | \`${target}\` | ${status_tag} |\n"
  done < <(df -h -P -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | tail -n +2)
fi

INODES_SUMMARY="não disponível"
if command -v df >/dev/null 2>&1; then
  ROOT_INODE_PCT="$(df -i / 2>/dev/null | tail -n 1 | awk '{print $5}' | tr -d '%')"
  if [ -n "$ROOT_INODE_PCT" ]; then
    INODES_SUMMARY="/: ${ROOT_INODE_PCT}% usado"
    if [ "$ROOT_INODE_PCT" -ge 90 ] 2>/dev/null; then
      add_finding "CRÍTICO" "Esgotamento de Inodes na partição raiz" "Uso de inodes em ${ROOT_INODE_PCT}% (>= 90%). Sistema não conseguirá criar arquivos." "Identificar diretórios com milhares de arquivos pequenos."
    elif [ "$ROOT_INODE_PCT" -ge 80 ] 2>/dev/null; then
      add_finding "ATENÇÃO" "Inodes da partição raiz elevados" "Uso de inodes em ${ROOT_INODE_PCT}% (>= 80%)." "Monitore o volume de arquivos de log e sessões."
    fi
  fi
fi

# Docker System DF
DOCKER_DF="não disponível (docker ausente ou sem permissão)"
if command -v docker >/dev/null 2>&1; then
  DOCKER_DF_RAW="$(run_with_timeout 5 docker system df 2>/dev/null || echo '')"
  if [ -n "$DOCKER_DF_RAW" ]; then
    DOCKER_DF="$(echo "$DOCKER_DF_RAW" | head -n 6)"
  else
    add_limitation "docker system df" "Daemon do Docker inacessível ou sem permissão de socket"
  fi
fi

calc_size() {
  local p="$1"
  if [ -e "$p" ]; then
    run_with_timeout 3 du -sh "$p" 2>/dev/null | cut -f1 || echo "erro"
  else
    echo "não existe"
  fi
}

SIZE_DATA="$(calc_size data)"
SIZE_BACKUPS="$(calc_size backups)"
SIZE_LOGS="$(calc_size logs)"
SIZE_PROJECT="$(calc_size .)"

# ==============================================================================
# 3. Rede e Exposição
# ==============================================================================
LISTEN_PORTS=""
APP_EXPOSED_DIRECT="Não"
PORT_3000_BIND="não escutando"
PORT_4000_BIND="não escutando"

if command -v ss >/dev/null 2>&1; then
  SS_RAW="$(run_with_timeout 4 ss -tlnp 2>/dev/null || echo '')"
elif command -v netstat >/dev/null 2>&1; then
  SS_RAW="$(run_with_timeout 4 netstat -tlnp 2>/dev/null || echo '')"
else
  SS_RAW=""
  add_limitation "ss/netstat" "Utilitários ss e netstat não disponíveis"
fi

if [ -n "$SS_RAW" ]; then
  if echo "$SS_RAW" | grep -E ':3000\b' | grep -q '0.0.0.0\|:::'; then
    PORT_3000_BIND="0.0.0.0:3000 (Pública)"
    APP_EXPOSED_DIRECT="Sim"
  elif echo "$SS_RAW" | grep -E ':3000\b' | grep -q '127.0.0.1\|::1'; then
    PORT_3000_BIND="127.0.0.1:3000 (Local)"
  fi

  if echo "$SS_RAW" | grep -E ':4000\b' | grep -q '0.0.0.0\|:::'; then
    PORT_4000_BIND="0.0.0.0:4000 (Pública)"
    APP_EXPOSED_DIRECT="Sim"
  elif echo "$SS_RAW" | grep -E ':4000\b' | grep -q '127.0.0.1\|::1'; then
    PORT_4000_BIND="127.0.0.1:4000 (Local)"
  fi

  LISTEN_PORTS="$(echo "$SS_RAW" | head -n 25 | mask_secrets)"
else
  LISTEN_PORTS="não disponível"
fi

FIREWALL_SUMMARY="não disponível"
if command -v ufw >/dev/null 2>&1; then
  UFW_STATUS="$(run_with_timeout 3 ufw status 2>/dev/null || echo '')"
  if [ -n "$UFW_STATUS" ]; then
    FIREWALL_SUMMARY="$(echo "$UFW_STATUS" | head -n 12)"
  else
    FIREWALL_SUMMARY="ufw instalado mas requer sudo para consulta"
    add_limitation "ufw status" "Requer permissões de root/sudo"
  fi
elif command -v iptables >/dev/null 2>&1; then
  IPT_OUT="$(run_with_timeout 3 iptables -S 2>/dev/null | head -n 5 || echo '')"
  if [ -n "$IPT_OUT" ]; then
    FIREWALL_SUMMARY="iptables ativo (${IPT_OUT})"
  else
    FIREWALL_SUMMARY="iptables instalado mas requer sudo"
    add_limitation "iptables" "Requer permissões de root/sudo"
  fi
else
  add_limitation "firewall" "ufw/iptables não encontrados"
fi

if [ "$APP_EXPOSED_DIRECT" = "Sim" ]; then
  add_finding "ATENÇÃO" "Portas da aplicação escutando em 0.0.0.0" "Portas 3000/4000 estão escutando na interface pública. Se usar Cloudflare Tunnel, não devem ficar abertas para a internet direta." "Configurar '127.0.0.1:3000:3000' no docker-compose.yml ou bloquear portas 3000/4000 no UFW."
fi

# Cloudflared / Túnel
CLOUDFLARED_STATUS="não detectado"
CLOUDFLARED_UPTIME="N/V"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet cloudflared 2>/dev/null; then
    CLOUDFLARED_STATUS="Ativo (systemd)"
    CLOUDFLARED_UPTIME="$(systemctl status cloudflared 2>/dev/null | grep -i 'active:' | sed 's/^[ \t]*//' || echo 'ativo')"
  fi
fi
if [ "$CLOUDFLARED_STATUS" = "não detectado" ]; then
  if pgrep -x cloudflared >/dev/null 2>&1; then
    CLOUDFLARED_STATUS="Ativo (processo avulso pgrep)"
  fi
fi

# Certificado TLS Local
TLS_SUMMARY="N/V (Terminação possivelmente no Cloudflare/Túnel)"
if [ -d /etc/letsencrypt/live ]; then
  TLS_EXP="$(run_with_timeout 4 find /etc/letsencrypt/live -name "cert.pem" 2>/dev/null | head -n 1)"
  if [ -n "$TLS_EXP" ] && command -v openssl >/dev/null 2>&1; then
    END_DATE="$(openssl x509 -enddate -noout -in "$TLS_EXP" 2>/dev/null | cut -d= -f2 || echo '')"
    if [ -n "$END_DATE" ]; then
      TLS_SUMMARY="Certificado em ${TLS_EXP} expira em: ${END_DATE}"
      # Verificar se expira em menos de 14 dias (1209600s)
      if ! openssl x509 -checkend 1209600 -noout -in "$TLS_EXP" 2>/dev/null; then
        add_finding "ATENÇÃO" "Certificado TLS expira em menos de 14 dias" "Certificado em ${TLS_EXP} precisa ser renovado em breve." "Executar 'sudo certbot renew'."
      fi
    fi
  fi
fi

PUBLIC_IP="não verificado"
DOMAIN_RESOLV="N/V"
if [ "$QUICK_MODE" -eq 0 ]; then
  PUBLIC_IP_RAW="$(run_with_timeout 5 curl -s --max-time 3 https://ifconfig.me 2>/dev/null || run_with_timeout 5 curl -s --max-time 3 https://api.ipify.org 2>/dev/null || echo '')"
  if [ -n "$PUBLIC_IP_RAW" ]; then
    PUBLIC_IP="$PUBLIC_IP_RAW"
  else
    PUBLIC_IP="indisponível ou sem conexão externa"
    add_limitation "IP Público" "Falha ao consultar provedores ifconfig.me / ipify"
  fi

  APP_DOMAIN=""
  if [ -f .env ]; then
    APP_DOMAIN="$(grep -E '^APP_URL=' .env | cut -d= -f2- | tr -d '"'\'' ' | sed -E 's~^https?://~~' | cut -d/ -f1 || echo '')"
  fi
  if [ -n "$APP_DOMAIN" ] && command -v host >/dev/null 2>&1; then
    RESOLV_OUT="$(run_with_timeout 3 host "$APP_DOMAIN" 2>/dev/null | grep 'has address' | head -n 1 || echo '')"
    DOMAIN_RESOLV="${APP_DOMAIN} -> ${RESOLV_OUT:-sem resposta DNS}"
  elif [ -n "$APP_DOMAIN" ] && command -v dig >/dev/null 2>&1; then
    RESOLV_OUT="$(run_with_timeout 3 dig +short "$APP_DOMAIN" 2>/dev/null | head -n 1 || echo '')"
    DOMAIN_RESOLV="${APP_DOMAIN} -> ${RESOLV_OUT:-sem resposta DNS}"
  fi
fi

# ==============================================================================
# 4. Docker
# ==============================================================================
DOCKER_VER="não disponível"
COMPOSE_VER="não disponível"
DOCKER_CONTAINERS_COUNT="0"
DOCKER_TABLE=""
DOCKER_STATS="não disponível"
PRIVILEGED_CONTAINERS=()
SOCK_MOUNTED_CONTAINERS=()

if command -v docker >/dev/null 2>&1; then
  DOCKER_VER="$(docker --version 2>/dev/null || echo 'erro ao ler versão')"
  COMPOSE_VER="$(docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo 'não disponível')"

  CONTAINER_IDS="$(run_with_timeout 5 docker ps -a -q 2>/dev/null || echo '')"
  if [ -n "$CONTAINER_IDS" ]; then
    DOCKER_CONTAINERS_COUNT="$(echo "$CONTAINER_IDS" | wc -w)"

    while read -r c_id; do
      [ -z "$c_id" ] && continue
      c_name="$(docker inspect --format '{{.Name}}' "$c_id" 2>/dev/null | sed 's~^/~~')"
      c_img="$(docker inspect --format '{{.Config.Image}}' "$c_id" 2>/dev/null)"
      c_status="$(docker inspect --format '{{.State.Status}}' "$c_id" 2>/dev/null)"
      c_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem healthcheck{{end}}' "$c_id" 2>/dev/null)"
      c_restarts="$(docker inspect --format '{{.RestartCount}}' "$c_id" 2>/dev/null || echo 0)"
      c_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$c_id" 2>/dev/null)"
      c_user="$(docker inspect --format '{{if .Config.User}}{{.Config.User}}{{else}}root{{end}}' "$c_id" 2>/dev/null)"
      c_created="$(docker inspect --format '{{.Created}}' "$c_id" 2>/dev/null | cut -d'T' -f1)"
      c_priv="$(docker inspect --format '{{.HostConfig.Privileged}}' "$c_id" 2>/dev/null)"
      c_mounts="$(docker inspect --format '{{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' "$c_id" 2>/dev/null)"

      if [ "$c_priv" = "true" ]; then
        PRIVILEGED_CONTAINERS+=("$c_name")
      fi

      if echo "$c_mounts" | grep -q 'docker\.sock'; then
        SOCK_MOUNTED_CONTAINERS+=("$c_name")
      fi

      status_label="[OK]"
      if [ "$c_status" != "running" ]; then
        status_label="[ATENÇÃO]"
        add_finding "ATENÇÃO" "Container ${c_name} não está em execução" "Estado atual: ${c_status}." "Verificar falha com 'docker logs ${c_name}' e reiniciar com 'docker compose up -d'."
      fi

      if [ "$c_restarts" -gt 3 ] 2>/dev/null; then
        status_label="[ATENÇÃO]"
        add_finding "ATENÇÃO" "Container ${c_name} reiniciou ${c_restarts} vezes" "Reinícios frequentes apontam para falhas recorrentes de processo ou memória." "Inspecionar causas de crash com 'docker logs --tail 100 ${c_name}'."
      fi

      if [ "$c_health" = "unhealthy" ]; then
        status_label="[CRÍTICO]"
        add_finding "CRÍTICO" "Container ${c_name} reportou estado UNHEALTHY" "O healthcheck interno falhou repetidamente." "Verificar se o processo interno responde nas portas esperadas."
      fi

      DOCKER_TABLE="${DOCKER_TABLE}| \`${c_name}\` | \`${c_img}\` | ${c_status} | ${c_health} | ${c_restarts} | ${c_policy} | ${c_user} | ${c_created} | ${status_label} |\n"
    done <<< "$CONTAINER_IDS"

    # Comparação com docker-compose.yml
    if [ -f docker-compose.yml ]; then
      COMPOSE_SERVICES="$(grep -E '^[ \t]{2}[a-zA-Z0-9_-]+:' docker-compose.yml | tr -d ' :' || echo '')"
      for s in $COMPOSE_SERVICES; do
        if [ "$s" != "services" ] && [ "$s" != "volumes" ] && [ "$s" != "networks" ]; then
          if ! echo "$CONTAINER_IDS" | xargs -n1 docker inspect --format '{{.Name}}' 2>/dev/null | grep -q "$s"; then
            add_finding "ATENÇÃO" "Serviço '${s}' declarado mas sem container ativo" "Configurado no docker-compose.yml mas não localizado entre os containers." "Subir serviços pendentes com 'docker compose up -d'."
          fi
        fi
      done
    fi

    DOCKER_STATS_RAW="$(run_with_timeout 6 docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}" 2>/dev/null || echo '')"
    if [ -n "$DOCKER_STATS_RAW" ]; then
      DOCKER_STATS="$DOCKER_STATS_RAW"
    fi
  else
    DOCKER_TABLE="Nenhum container Docker encontrado no sistema."
    add_finding "ATENÇÃO" "Nenhum container Docker ativo" "A stack Uno KaWiHe é baseada em Docker mas nenhum container está rodando." "Executar 'docker compose up -d' no diretório raiz."
  fi
else
  add_limitation "Docker" "Binário docker não encontrado ou inacessível"
fi

if [ "${#PRIVILEGED_CONTAINERS[@]}" -gt 0 ]; then
  add_finding "ATENÇÃO" "Containers em modo privilegiado" "Container(s) ${PRIVILEGED_CONTAINERS[*]} rodam com privilégios de kernel (--privileged)." "Remover privileged: true do compose a menos que estritamente necessário."
fi

if [ "${#SOCK_MOUNTED_CONTAINERS[@]}" -gt 0 ]; then
  add_finding "ATENÇÃO" "docker.sock montado dentro de container" "Container(s) ${SOCK_MOUNTED_CONTAINERS[*]} possuem acesso direto ao socket do Docker da VM." "Isolar o container sem montar o socket para prevenir escalação de privilégios."
fi

# ==============================================================================
# 5. Aplicação (.env, /health, data/)
# ==============================================================================
ENV_EXISTS="Não"
ENV_PERMS="N/V"
ENV_VAR_TABLE=""
OBSOLETE_VARS_FOUND=()

if [ -f .env ]; then
  ENV_EXISTS="Sim"
  ENV_PERMS="$(run_with_timeout 2 stat -c '%a' .env 2>/dev/null || ls -l .env | awk '{print $1}')"
  if [ "$ENV_PERMS" != "600" ] && [ "$ENV_PERMS" != "400" ]; then
    add_finding "ATENÇÃO" "Permissões do arquivo .env muito abertas" "Permissão atual: ${ENV_PERMS} (esperado: 600). Outros usuários da VM podem ler segredos." "Executar 'chmod 600 .env'."
  fi

  while IFS='=' read -r key val || [ -n "$key" ]; do
    clean_key="$(echo "$key" | tr -d ' ')"
    [[ "$clean_key" =~ ^#.* ]] && continue
    [ -z "$clean_key" ] && continue

    clean_val="$(echo "$val" | tr -d '\r\n"' | tr -d "'")"
    val_len="${#clean_val}"
    status_def="Definida (${val_len} caracteres)"
    [ "$val_len" -eq 0 ] && status_def="Vazia"

    if [ "$clean_key" = "ADMIN_PIN" ]; then
      OBSOLETE_VARS_FOUND+=("ADMIN_PIN")
    fi

    ENV_VAR_TABLE="${ENV_VAR_TABLE}| \`${clean_key}\` | ${status_def} |\n"
  done < .env

  if [ "${#OBSOLETE_VARS_FOUND[@]}" -gt 0 ]; then
    add_finding "CRÍTICO" "Variável obsoleta ADMIN_PIN presente no .env" "O Uno KaWiHe utiliza autenticação por conta/JWT e descontinuou PINs estáticos." "Remover imediatamente a linha ADMIN_PIN do .env."
  fi
else
  add_finding "ATENÇÃO" "Arquivo .env inexistente" "O arquivo de configuração .env não foi localizado." "Copiar .env.example para .env e preencher as chaves obrigatórias."
fi

# Testes de /health
HEALTH_PORT_3000="não verificado"
HEALTH_PORT_4000="não verificado"

if command -v curl >/dev/null 2>&1; then
  START_MS="$(date +%s%3N 2>/dev/null || echo 0)"
  HTTP_3000="$(run_with_timeout 3 curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health 2>/dev/null || echo 'falha')"
  END_MS="$(date +%s%3N 2>/dev/null || echo 0)"
  RESP_TIME="$((END_MS - START_MS))"
  [ "$RESP_TIME" -lt 0 ] && RESP_TIME=0
  HEALTH_PORT_3000="HTTP ${HTTP_3000} (${RESP_TIME}ms)"
  if [ "$HTTP_3000" != "200" ]; then
    add_finding "ATENÇÃO" "Endpoint /health na porta 3000 não retornou 200" "Status recebido: ${HTTP_3000}." "Verificar se o serviço do jogo iniciou corretamente ('docker logs uno-game')."
  fi

  HTTP_4000="$(run_with_timeout 3 curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo 'não rodando')"
  HEALTH_PORT_4000="HTTP ${HTTP_4000}"
fi

# Pasta data/ e users.json
DATA_EXISTS="Não"
DATA_FILES_TABLE=""
USERS_COUNT="N/V"
USERS_JSON_VALID="N/V"
DATA_IN_VOLUME="N/V"

if [ -d data ]; then
  DATA_EXISTS="Sim"
  DATA_PERMS="$(run_with_timeout 2 stat -c '%a' data 2>/dev/null || ls -ld data | awk '{print $1}')"
  if [ "$DATA_PERMS" != "700" ] && [ "$DATA_PERMS" != "750" ]; then
    add_finding "ATENÇÃO" "Permissões do diretório data/ muito permissivas" "Permissão atual: ${DATA_PERMS} (esperado: 700)." "Executar 'chmod 700 data'."
  fi

  for f in data/*; do
    [ ! -e "$f" ] && continue
    fname="$(basename "$f")"
    fsize="$(run_with_timeout 2 du -sh "$f" 2>/dev/null | cut -f1)"
    fperm="$(run_with_timeout 2 stat -c '%a' "$f" 2>/dev/null || ls -l "$f" | awk '{print $1}')"
    fmtime="$(run_with_timeout 2 date -r "$f" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/V')"
    DATA_FILES_TABLE="${DATA_FILES_TABLE}| \`${fname}\` | ${fsize} | ${fperm} | ${fmtime} |\n"
  done

  # Verificar users.json SEM ler nomes
  if [ -f data/users.json ]; then
    if command -v jq >/dev/null 2>&1; then
      if jq empty data/users.json 2>/dev/null; then
        USERS_JSON_VALID="Sim (JSON válido)"
        USERS_COUNT="$(jq 'if type=="array" then length elif type=="object" and .users then (.users|length) else 0 end' data/users.json 2>/dev/null || echo '0')"
      else
        USERS_JSON_VALID="Corrompido / Inválido"
        add_finding "CRÍTICO" "data/users.json está corrompido" "Falha na validação de sintaxe JSON do arquivo de usuários." "Restaurar data/users.json do backup mais recente imediatamente."
      fi
    elif command -v node >/dev/null 2>&1; then
      NODE_COUNT="$(node -e 'try{const d=JSON.parse(require("fs").readFileSync("data/users.json"));console.log(Array.isArray(d)?d.length:(d.users?d.users.length:0))}catch(e){console.log("INVALID")}' 2>/dev/null || echo 'INVALID')"
      if [ "$NODE_COUNT" = "INVALID" ]; then
        USERS_JSON_VALID="Corrompido / Inválido"
        add_finding "CRÍTICO" "data/users.json está corrompido" "Falha no parser do arquivo de usuários." "Restaurar data/users.json a partir do backup."
      else
        USERS_JSON_VALID="Sim (JSON válido)"
        USERS_COUNT="$NODE_COUNT"
      fi
    else
      add_limitation "Validação de data/users.json" "Utilitários jq e node não disponíveis"
    fi
  fi

  # data/ está em volume Docker?
  if [ -f docker-compose.yml ] && grep -q './data:/app/data' docker-compose.yml; then
    DATA_IN_VOLUME="Sim (montado como bind mount ./data:/app/data)"
  else
    DATA_IN_VOLUME="Não identificado no compose"
  fi
fi

# ==============================================================================
# 6. Git e Versão
# ==============================================================================
GIT_BRANCH="N/V"
GIT_COMMIT="N/V"
GIT_DIRTY="N/V"
GIT_REMOTE_URL="N/V"
GIT_AHEAD_BEHIND="N/V"
CONTAINER_COMMIT_MATCH="N/V"

if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  GIT_BRANCH="$(run_with_timeout 3 git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/V')"
  GIT_COMMIT="$(run_with_timeout 3 git log -1 --format='%h (%cd) - %s' --date=short 2>/dev/null || echo 'N/V' | mask_secrets)"
  
  GIT_DIRTY_FILES="$(run_with_timeout 4 git status --porcelain 2>/dev/null || echo '')"
  if [ -n "$GIT_DIRTY_FILES" ]; then
    MOD_COUNT="$(echo "$GIT_DIRTY_FILES" | wc -l)"
    GIT_DIRTY="Alterado (${MOD_COUNT} arquivo(s) modificados localmente)"
  else
    GIT_DIRTY="Limpo (árvore de trabalho sem alterações pendentes)"
  fi

  RAW_REMOTE="$(run_with_timeout 3 git config --get remote.origin.url 2>/dev/null || echo '')"
  GIT_REMOTE_URL="$(echo "$RAW_REMOTE" | sed -E 's/https:\/\/[^@:]+:[^@]+@/https:\/\/***@/g')"

  if [ "$QUICK_MODE" -eq 0 ] && [ -n "$RAW_REMOTE" ]; then
    REMOTE_HEAD="$(run_with_timeout 6 git ls-remote origin HEAD 2>/dev/null | awk '{print $1}')"
    LOCAL_HEAD="$(run_with_timeout 2 git rev-parse HEAD 2>/dev/null || echo '')"
    if [ -n "$REMOTE_HEAD" ] && [ -n "$LOCAL_HEAD" ]; then
      if [ "$REMOTE_HEAD" = "$LOCAL_HEAD" ]; then
        GIT_AHEAD_BEHIND="Sincronizado com origin/HEAD"
      else
        GIT_AHEAD_BEHIND="Divergente do remoto (Local: ${LOCAL_HEAD:0:7}, Remoto: ${REMOTE_HEAD:0:7})"
        add_finding "INFO" "Repositório Git possui atualizações pendentes no remoto" "O commit local difere do commit da branch remota." "Executar './deploy.sh' para atualizar caso haja novidades."
      fi
    else
      GIT_AHEAD_BEHIND="Não verificado (sem rede ou credencial)"
      add_limitation "git ls-remote" "Falha na consulta remota"
    fi
  else
    GIT_AHEAD_BEHIND="ignorado (--quick)"
  fi

  # CRÍTICO: arquivos sensíveis rastreados no Git
  TRACKED_SENSITIVE="$(run_with_timeout 3 git ls-files data/ .env .env.local 2>/dev/null || echo '')"
  if [ -n "$TRACKED_SENSITIVE" ]; then
    add_finding "CRÍTICO" "Arquivos confidenciais rastreados no Git" "Arquivos sensíveis rastreados no controle de versão: ${TRACKED_SENSITIVE}." "Remover com 'git rm --cached <arquivo>' e comitar imediatamente."
  fi
fi

# ==============================================================================
# 7. Backups
# ==============================================================================
BACKUP_COUNT=0
LATEST_BACKUP_NAME="Nenhum"
LATEST_BACKUP_AGE="N/V"
LATEST_BACKUP_HAS_USERS="N/V"
BACKUP_CRON_TIMERS="Nenhum cron ou timer de backup detectado"

if [ -d backups ]; then
  BACKUP_FILES="$(run_with_timeout 4 find backups/ -maxdepth 2 -type f \( -name "*.tar.gz" -o -name "*.zip" -o -name "*.tgz" -o -name "*.json" \) 2>/dev/null | sort)"
  if [ -n "$BACKUP_FILES" ]; then
    BACKUP_COUNT="$(echo "$BACKUP_FILES" | wc -l)"
    LATEST_BACKUP="$(echo "$BACKUP_FILES" | tail -n 1)"
    LATEST_BACKUP_NAME="$(basename "$LATEST_BACKUP")"

    if [ -f "$LATEST_BACKUP" ]; then
      MTIME_SEC="$(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || stat -f %m "$LATEST_BACKUP" 2>/dev/null || echo 0)"
      NOW_SEC="$(date +%s)"
      DIFF_DAYS="$(( (NOW_SEC - MTIME_SEC) / 86400 ))"
      LATEST_BACKUP_AGE="${DIFF_DAYS} dia(s)"

      if [ "$DIFF_DAYS" -gt 7 ]; then
        add_finding "ATENÇÃO" "Último backup com mais de 7 dias" "O backup mais recente foi gerado há ${DIFF_DAYS} dias." "Executar './backup.sh' para registrar cópia recente."
      fi

      if [[ "$LATEST_BACKUP" =~ \.tar\.gz$|\.tgz$ ]]; then
        if tar -tzf "$LATEST_BACKUP" 2>/dev/null | grep -q 'users\.json'; then
          LATEST_BACKUP_HAS_USERS="Sim (users.json confirmado no arquivo)"
        else
          LATEST_BACKUP_HAS_USERS="Ausente no arquivo"
          add_finding "ATENÇÃO" "Último backup não contém users.json" "O arquivo mais recente não incluiu a base de usuários." "Ajustar script de backup para garantir integridade da pasta data/."
        fi
      fi
    fi
  else
    add_finding "CRÍTICO" "Nenhum arquivo de backup encontrado" "A pasta backups/ está vazia." "Executar './backup.sh' imediatamente."
  fi
else
  add_finding "CRÍTICO" "Diretório backups/ inexistente" "Não há diretório de backups configurado." "Criar diretório e executar rotina de backup."
fi

# Rotinas Automáticas (cron/systemd)
CRON_OUT="$(run_with_timeout 3 crontab -l 2>/dev/null | grep -Ei 'backup|uno|kawihe' || echo '')"
if [ -n "$CRON_OUT" ]; then
  BACKUP_CRON_TIMERS="Cron ativo: ${CRON_OUT}"
elif command -v systemctl >/dev/null 2>&1; then
  TIMERS_OUT="$(run_with_timeout 3 systemctl list-timers 2>/dev/null | grep -Ei 'backup|uno' || echo '')"
  if [ -n "$TIMERS_OUT" ]; then
    BACKUP_CRON_TIMERS="Systemd timer ativo: ${TIMERS_OUT}"
  fi
fi

# ==============================================================================
# 8. Segurança Básica
# ==============================================================================
SSH_PASS_AUTH="N/V"
SSH_ROOT_LOGIN="N/V"
SUDO_USERS="N/V"

if [ -f /etc/ssh/sshd_config ]; then
  SSH_PASS_AUTH="$(grep -Ei '^[ \t]*PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -n 1 | awk '{print $2}' || echo 'N/V')"
  SSH_ROOT_LOGIN="$(grep -Ei '^[ \t]*PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -n 1 | awk '{print $2}' || echo 'N/V')"
  
  if [ "${SSH_PASS_AUTH,,}" = "yes" ]; then
    add_finding "ATENÇÃO" "SSH permite login com senha" "PasswordAuthentication ativado. Facilita ataques de dicionário e força bruta." "Desativar login por senha e utilizar autenticação por chaves SSH."
  fi
fi

if command -v getent >/dev/null 2>&1; then
  SUDO_USERS="$(getent group sudo 2>/dev/null | cut -d: -f4 || echo 'N/V')"
fi

PERM_777_COUNT=0
if command -v find >/dev/null 2>&1; then
  PERM_777_FOUND="$(run_with_timeout 5 find . -maxdepth 3 -not -path "*/.*" -not -path "*/node_modules*" -type f -perm 0777 2>/dev/null || echo '')"
  if [ -n "$PERM_777_FOUND" ]; then
    PERM_777_COUNT="$(echo "$PERM_777_FOUND" | wc -l)"
    add_finding "ATENÇÃO" "Arquivos com permissão 777 encontrados" "Foram detectados ${PERM_777_COUNT} arquivos com permissões mundiais de escrita (777)." "Corrigir com 'chmod 644 <arquivos>'."
  fi
fi

# ==============================================================================
# 9. Arquitetura e Scripts
# ==============================================================================
DUPLICATE_SCRIPTS=()
for root_s in *.sh; do
  [ ! -e "$root_s" ] && continue
  if [ -e "scripts/${root_s}" ]; then
    DUPLICATE_SCRIPTS+=("${root_s} e scripts/${root_s}")
  fi
done

if [ "${#DUPLICATE_SCRIPTS[@]}" -gt 0 ]; then
  add_finding "ATENÇÃO" "Scripts duplicados na raiz e em scripts/" "Arquivos homônimos presentes em ambos os locais: ${DUPLICATE_SCRIPTS[*]}." "Padronizar o ponto de entrada canônico para evitar divergências de versão."
fi

# ==============================================================================
# 10. Logs Recentes (Últimas 24h)
# ==============================================================================
LOG_ERRORS_COUNT=0
LOG_ERRORS_TOP=""

if command -v docker >/dev/null 2>&1 && [ "$QUICK_MODE" -eq 0 ] && [ -n "$CONTAINER_IDS" ]; then
  for c_id in $CONTAINER_IDS; do
    [ -z "$c_id" ] && continue
    c_name="$(docker inspect --format '{{.Name}}' "$c_id" 2>/dev/null | sed 's~^/~~')"
    c_errs="$(run_with_timeout 6 docker logs --since 24h "$c_id" 2>&1 | grep -Ei 'error|fatal|exception|unhandled' || echo '')"
    if [ -n "$c_errs" ]; then
      this_count="$(echo "$c_errs" | wc -l)"
      LOG_ERRORS_COUNT="$((LOG_ERRORS_COUNT + this_count))"
      LOG_ERRORS_TOP="${LOG_ERRORS_TOP}\n### Container \`${c_name}\` (${this_count} ocorrências)\n"
      LOG_ERRORS_TOP="${LOG_ERRORS_TOP}$(echo "$c_errs" | tail -n 10 | mask_secrets)\n"
    fi
  done
else
  LOG_ERRORS_TOP="Verificação de logs de container ignorada (--quick ou docker ausente)."
fi

OOM_KILLS="0"
if command -v dmesg >/dev/null 2>&1; then
  OOM_LINES="$(run_with_timeout 3 dmesg 2>/dev/null | grep -Ei 'oom-killer|out of memory' || echo '')"
  if [ -n "$OOM_LINES" ]; then
    OOM_KILLS="$(echo "$OOM_LINES" | wc -l)"
    add_finding "CRÍTICO" "OOM Killer acionado recentemente" "O kernel registrou ${OOM_KILLS} evento(s) de falta de memória (Out of Memory)." "Reduzir carga de memória dos containers ou redimensionar a VM."
  fi
else
  add_limitation "dmesg (OOM check)" "Comando dmesg requer privilégios de root"
fi

# ==============================================================================
# GERAÇÃO DO RELATÓRIO EM MARKDOWN
# ==============================================================================

OVERALL_VERDICT="[OK]"
if [ "$OVERALL_EXIT_CODE" -eq 2 ]; then
  OVERALL_VERDICT="[CRÍTICO]"
elif [ "$OVERALL_EXIT_CODE" -eq 1 ]; then
  OVERALL_VERDICT="[ATENÇÃO]"
fi

mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" 2>/dev/null || true
REPORT_FILE="${REPORT_DIR}/relatorio-${FILE_TIMESTAMP}.md"

generate_report() {
cat << EOF
# Relatório de Diagnóstico da VM - Uno KaWiHe
**Data/Hora (UTC):** ${TIMESTAMP_UTC}  
**Data/Hora (Local):** ${TIMESTAMP_LOCAL}  
**Servidor (Hostname):** \`${HOSTNAME_RAW}\`  
**Veredito Geral:** **${OVERALL_VERDICT}**

---

## 0. Resumo Executivo
Veredito da avaliação: **${OVERALL_VERDICT}**

### Lista Priorizada de Achados
EOF

if [ "${#FINDINGS[@]}" -eq 0 ]; then
  echo "Nenhum problema grave ou atenção identificados. Sistema operando conforme esperado [OK]."
else
  for sev_filter in "CRÍTICO" "ATENÇÃO" "INFO"; do
    for f in "${FINDINGS[@]}"; do
      IFS='|' read -r s item why action <<< "$f"
      if [ "$s" = "$sev_filter" ]; then
        echo "- **[${s}]** ${item}: ${why} -> *Ação Recomendada:* \`${action}\`"
      fi
    done
  done
fi

cat << 'EOF'

---

## 1. Contexto para IA
O **Uno KaWiHe** é uma plataforma de jogo de cartas multiplayer em tempo real com arquitetura orientada a microsserviços leves:
- **Backend:** Node.js, Express, WebSocket nativo ('ws') para partidas em tempo real e WebRTC P2P para voz.
- **Frontend:** SPA moderna em React com TypeScript e Vite.
- **Persistência:** Arquivos estruturados em JSON na pasta local `data/` (`users.json`, `invites.json`, `stats.json`).
- **Orquestração:** Docker Compose com containers dedicados para o jogo (`uno-game`) e autenticação central (`kawihe-auth`).
- **Exposição:** Projetado para acesso externo através de domínio próprio protegido por túnel Cloudflare (cloudflared).

**Significado das Classificações:**
- `[OK]`: Parâmetro dentro das margens ideais de estabilidade e segurança.
- `[ATENÇÃO]`: Ponto com potencial risco operacional, degradação de performance ou desvio de padrão.
- `[CRÍTICO]`: Falha operacional ativa, risco imediato de parada de serviço ou vulnerabilidade de segurança.
- `[INFO]`: Dado descritivo relevante para tomada de decisão.
- `[N/V]`: Não verificado por ausência de ferramenta ou privilégios de execução (sudo).
EOF

cat << EOF

---

## 2. Servidor
| Item | Valor | Status |
| :--- | :--- | :--- |
| **Sistema Operacional** | ${OS_NAME} | [INFO] |
| **Kernel** | \`${KERNEL_VER}\` | [INFO] |
| **Arquitetura** | \`${ARCH_NAME}\` | [INFO] |
| **CPU (Núcleos)** | ${CPU_CORES} núcleo(s) | [INFO] |
| **RAM Total / Disponível** | ${MEM_TOTAL} / ${MEM_AVAIL} (${MEM_PERCENT_FREE}% livre) | $([ "$MEM_PERCENT_FREE" -lt 8 ] && echo "[CRÍTICO]" || ([ "$MEM_PERCENT_FREE" -lt 15 ] && echo "[ATENÇÃO]" || echo "[OK]")) |
| **Swap Total / Em Uso** | ${SWAP_TOTAL} / ${SWAP_USED} | $([ -n "$SWAP_PERCENT_USED" ] && [ "$SWAP_PERCENT_USED" -gt 50 ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **Uptime** | ${UPTIME_TEXT} | [OK] |
| **Load Average (1m, 5m, 15m)** | ${LOAD_1M}, ${LOAD_5M}, ${LOAD_15M} | $([ -n "$LOAD_INT" ] && [ "$LOAD_INT" -ge "$CPU_CORES" ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **Reinício Pendente** | ${REBOOT_REQUIRED} | $([ "$REBOOT_REQUIRED" = "Não" ] && echo "[OK]" || echo "[ATENÇÃO]") |
| **Atualizações de Segurança** | ${SEC_UPDATES} | [INFO] |
| **Sincronização NTP** | ${TIME_SYNC} | $([ "$TIME_SYNC" = "Não sincronizado" ] && echo "[ATENÇÃO]" || echo "[OK]") |

---

## 3. Disco
### Uso por Partição
| Sistema de Arquivos | Tamanho | Usado | Disponível | Uso % | Montagem | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
EOF
echo -e "$DISK_ROWS"

cat << EOF
- **Inodes da Raiz (/):** ${INODES_SUMMARY}

### Tamanho dos Diretórios do Projeto
| Diretório / Recurso | Tamanho |
| :--- | :--- |
| Base de Dados (\`data/\`) | \`${SIZE_DATA}\` |
| Cópias de Segurança (\`backups/\`) | \`${SIZE_BACKUPS}\` |
| Arquivos de Log (\`logs/\`) | \`${SIZE_LOGS}\` |
| Diretório Completo do Projeto | \`${SIZE_PROJECT}\` |

### Docker Storage Summary
\`\`\`text
${DOCKER_DF}
\`\`\`

---

## 4. Rede e Exposição
- **Porta 3000 (Uno Game):** \`${PORT_3000_BIND}\`
- **Porta 4000 (Auth Service):** \`${PORT_4000_BIND}\`
- **Exposição Direta na Internet:** **$([ "$APP_EXPOSED_DIRECT" = "Sim" ] && echo "[ATENÇÃO] Sim (portas em 0.0.0.0)" || echo "[OK] Não (apenas localhost ou túnel)")**
- **Status Cloudflared / Túnel:** \`${CLOUDFLARED_STATUS}\`
- **Certificado TLS Local:** \`${TLS_SUMMARY}\`
- **IP Público Detectado:** \`${PUBLIC_IP}\`
- **Resolução de Domínio:** \`${DOMAIN_RESOLV}\`

### Resumo do Firewall
\`\`\`text
${FIREWALL_SUMMARY}
\`\`\`

### Portas Escutando no Sistema (Resumo)
\`\`\`text
${LISTEN_PORTS}
\`\`\`

---

## 5. Docker
- **Versão Docker:** \`${DOCKER_VER}\`
- **Versão Docker Compose:** \`${COMPOSE_VER}\`
- **Total de Containers:** \`${DOCKER_CONTAINERS_COUNT}\`

### Estado dos Containers
| Container | Imagem | Estado | Saúde | Reinícios | Política | Usuário | Criado em | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
EOF
echo -e "$DOCKER_TABLE"

cat << EOF

### Consumo de Recursos dos Containers (docker stats)
\`\`\`text
${DOCKER_STATS}
\`\`\`

---

## 6. Aplicação
### Configuração (.env)
- **Arquivo \`.env\` Existe:** ${ENV_EXISTS}
- **Permissões do \`.env\`:** \`${ENV_PERMS}\` $([ "$ENV_PERMS" = "600" ] && echo "[OK]" || echo "[ATENÇÃO]")

| Variável | Estado |
| :--- | :--- |
EOF
echo -e "$ENV_VAR_TABLE"

cat << EOF
### Testes de Endpoint /health
- **Aplicação UNO (Porta 3000):** \`${HEALTH_PORT_3000}\`
- **Auth Microservice (Porta 4000):** \`${HEALTH_PORT_4000}\`

### Armazenamento de Dados (\`data/\`)
- **Diretório \`data/\` Presente:** ${DATA_EXISTS}
- **Volume Docker:** ${DATA_IN_VOLUME}
- **Integridade de \`users.json\`:** ${USERS_JSON_VALID}
- **Total de Usuários Cadastrados:** **${USERS_COUNT}** (somente contagem numérica)

| Arquivo em data/ | Tamanho | Permissão | Modificado em |
| :--- | :--- | :--- | :--- |
EOF
echo -e "$DATA_FILES_TABLE"

cat << EOF

---

## 7. Git e Versão
| Parâmetro | Detalhe |
| :--- | :--- |
| **Branch Ativo** | \`${GIT_BRANCH}\` |
| **Último Commit** | \`${GIT_COMMIT}\` |
| **Working Tree** | ${GIT_DIRTY} |
| **Comparação com Remoto** | ${GIT_AHEAD_BEHIND} |
| **URL Remota (Sanitizada)** | \`${GIT_REMOTE_URL}\` |

---

## 8. Backups
- **Diretório:** \`backups/\`
- **Total de Arquivos de Backup:** \`${BACKUP_COUNT}\`
- **Backup Mais Recente:** \`${LATEST_BACKUP_NAME}\`
- **Idade do Último Backup:** \`${LATEST_BACKUP_AGE}\` $([ -n "$DIFF_DAYS" ] && [ "$DIFF_DAYS" -gt 7 ] && echo "[ATENÇÃO]" || echo "[OK]")
- **users.json Preservado no Backup:** \`${LATEST_BACKUP_HAS_USERS}\`
- **Rotinas Automáticas:** \`${BACKUP_CRON_TIMERS}\`

---

## 9. Segurança Básica
| Verificação | Resultado | Status |
| :--- | :--- | :--- |
| **SSH com Autenticação por Senha** | \`${SSH_PASS_AUTH}\` | $([ "${SSH_PASS_AUTH,,}" = "yes" ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **SSH Login Root Permitido** | \`${SSH_ROOT_LOGIN}\` | $([ "${SSH_ROOT_LOGIN,,}" = "yes" ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **Usuários com Acesso Sudo** | \`${SUDO_USERS}\` | [INFO] |
| **Containers Privilegiados** | ${#PRIVILEGED_CONTAINERS[@]} | $([ "${#PRIVILEGED_CONTAINERS[@]}" -gt 0 ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **docker.sock em Containers** | ${#SOCK_MOUNTED_CONTAINERS[@]} | $([ "${#SOCK_MOUNTED_CONTAINERS[@]}" -gt 0 ] && echo "[ATENÇÃO]" || echo "[OK]") |
| **Arquivos com Permissão 777** | ${PERM_777_COUNT} encontrado(s) | $([ "$PERM_777_COUNT" -gt 0 ] && echo "[ATENÇÃO]" || echo "[OK]") |

---

## 10. Arquitetura Detectada
### Fluxo de Conexão Real
\`\`\`text
[ Internet / Jogadores ]
          |
          v
[ Cloudflare Tunnel (cloudflared): $([ "$CLOUDFLARED_STATUS" != "não detectado" ] && echo "DETECTADO" || echo "NÃO DETECTADO") ]
          |
          v
[ Firewall UFW / iptables: $([ "$FIREWALL_SUMMARY" != "não disponível" ] && echo "DETECTADO" || echo "NÃO DETECTADO") ]
          |
          v
+-------------------+--------------------+
| Porta 3000        | Porta 4000         |
| uno-game          | kawihe-auth        |
+-------------------+--------------------+
          |                   |
          +---------+---------+
                    |
                    v
          [ Volume Local: ./data ]
          (users.json, invites.json, stats.json)
\`\`\`

### Scripts Identificados no Repositório
EOF

for s in *.sh scripts/*.sh; do
  [ ! -e "$s" ] && continue
  s_desc="Script de automação"
  case "$s" in
    *backup.sh) s_desc="Gera arquivo compactado de backup da pasta data/ com timestamp" ;;
    *deploy.sh) s_desc="Executa rotina de atualização, build de imagens e subida de containers" ;;
    *cloudflare.sh) s_desc="Configura e gerencia o túnel de rede seguro da Cloudflare" ;;
    *create-user.sh) s_desc="Cadastra usuário ou administrador diretamente na base" ;;
    *create-invite.sh) s_desc="Gera código de convite @XXXX para novos jogadores" ;;
    *restore.sh) s_desc="Restaura cópia de segurança compactada sobre a pasta data/" ;;
    *status.sh) s_desc="Exibe status resumido dos serviços e processos em execução" ;;
    *sysinfo.sh) s_desc="Exibe informações detalhadas de hardware e memória" ;;
    *relatorio-vm.sh) s_desc="Diagnóstico completo e seguro do servidor e aplicação" ;;
  esac
  echo "- \`${s}\`: ${s_desc}"
done

cat << EOF

---

## 11. Logs Recentes (Últimas 24h)
- **Total de Linhas com Erros Identificadas:** **${LOG_ERRORS_COUNT}**
- **OOM Kills Registrados no Kernel:** **${OOM_KILLS}**

\`\`\`text
$(echo -e "$LOG_ERRORS_TOP" | mask_secrets)
\`\`\`

---

## 12. Ações Recomendadas
EOF

if [ "${#FINDINGS[@]}" -eq 0 ]; then
  echo "1. Nenhuma ação corretiva necessária. O ambiente está saudável."
else
  count=1
  for sev_filter in "CRÍTICO" "ATENÇÃO"; do
    for f in "${FINDINGS[@]}"; do
      IFS='|' read -r s item why action <<< "$f"
      if [ "$s" = "$sev_filter" ]; then
        echo "${count}. **[${s}]** ${item}"
        echo "   - *Motivo:* ${why}"
        echo "   - *Comando Sugerido:* \`${action}\`"
        count=$((count + 1))
      fi
    done
  done
fi

cat << EOF

---

## 13. Limitações da Verificação
| Item Não Verificado | Motivo / Observação |
| :--- | :--- |
EOF

if [ "${#LIMITATIONS[@]}" -eq 0 ]; then
  echo "| Nenhuma | Todas as verificações previstas foram concluídas com sucesso. |"
else
  for lim in "${LIMITATIONS[@]}"; do
    IFS='|' read -r l_item l_reason <<< "$lim"
    echo "| \`${l_item}\` | ${l_reason} |"
  done
fi

}

generate_report | mask_secrets > "$REPORT_FILE"
chmod 600 "$REPORT_FILE" 2>/dev/null || true

cat "$REPORT_FILE"

if [ -d "$REPORT_DIR" ]; then
  TOTAL_EXISTING="$(find "$REPORT_DIR" -maxdepth 1 -name "relatorio-*.md" -type f | wc -l)"
  if [ "$TOTAL_EXISTING" -gt "$MAX_REPORTS" ]; then
    EXCESS="$((TOTAL_EXISTING - MAX_REPORTS))"
    find "$REPORT_DIR" -maxdepth 1 -name "relatorio-*.md" -type f | sort | head -n "$EXCESS" | while read -r old_rep; do
      rm -f "$old_rep"
    done
  fi
fi

echo ""
echo "=============================================================================="
echo "Relatório gerado em: ${REPORT_FILE} (Permissão: 600)"
echo "Código de Saída: ${OVERALL_EXIT_CODE} (${OVERALL_VERDICT})"
echo "=============================================================================="

exit "$OVERALL_EXIT_CODE"
