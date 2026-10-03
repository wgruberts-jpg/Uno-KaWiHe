#!/usr/bin/env bash
# ==============================================================================
# Uno KaWiHe - System Health & Diagnostics (Compact Info)
# ==============================================================================

# Cores ANSI
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[1;32m"
C_YELLOW="\033[1;33m"
C_RED="\033[1;31m"
C_CYAN="\033[1;36m"
C_BLUE="\033[1;34m"
C_GRAY="\033[0;90m"

clear 2>/dev/null || true

echo -e "${C_CYAN}${C_BOLD}======================================================${C_RESET}"
echo -e "${C_CYAN}${C_BOLD}   🎮 UNO KAWIHE - DIAGNÓSTICO E SAÚDE DA VM          ${C_RESET}"
echo -e "${C_CYAN}${C_BOLD}======================================================${C_RESET}"
echo -e "${C_GRAY}Data/Hora:${C_RESET} $(date '+%d/%m/%Y %H:%M:%S %Z')"

# 1. Host & Uptime
UPTIME_STR=$(uptime -p 2>/dev/null || uptime | awk -F'( |,|:)+' '{if ($7=="min") m=$6; else {if ($7~/^day/) {d=$6;h=$8;m=$9} else {h=$6;m=$7}}} {print d+0,"dias,",h+0,"horas,",m+0,"min"}')
LOAD_AVG=$(cat /proc/loadavg 2>/dev/null | awk '{print $1", "$2", "$3}' || uptime | awk -F'load average:' '{ print $2 }')
echo -e "\n${C_BOLD}🖥️  SISTEMA & HOST:${C_RESET}"
echo -e "   • ${C_GRAY}Hostname:${C_RESET} $(hostname)"
echo -e "   • ${C_GRAY}OS / Kernel:${C_RESET} $(grep -oP '(?<=PRETTY_NAME=")[^"]*' /etc/os-release 2>/dev/null || uname -s) (${C_GRAY}$(uname -r)${C_RESET})"
echo -e "   • ${C_GRAY}Tempo de Atividade (Uptime):${C_RESET} ${C_GREEN}${UPTIME_STR}${C_RESET}"
echo -e "   • ${C_GRAY}Carga Média (Load Avg):${C_RESET} ${LOAD_AVG}"

# 2. CPU
CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^[ \t]*//' || echo "N/A")
CPU_CORES=$(grep -c "^processor" /proc/cpuinfo 2>/dev/null || nproc 2>/dev/null || echo "1")
echo -e "\n${C_BOLD}⚡ PROCESSADOR (CPU):${C_RESET}"
echo -e "   • ${C_GRAY}Modelo:${C_RESET} ${CPU_MODEL}"
echo -e "   • ${C_GRAY}Núcleos (vCPUs):${C_RESET} ${CPU_CORES}"

# 3. Memória RAM e Swap
echo -e "\n${C_BOLD}🧠 MEMÓRIA RAM & SWAP:${C_RESET}"
if command -v free >/dev/null 2>&1; then
    MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
    MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
    MEM_AVAIL=$(free -m | awk '/^Mem:/{print $7}')
    MEM_PCT=$(( 100 * MEM_USED / (MEM_TOTAL > 0 ? MEM_TOTAL : 1) ))

    if [ "$MEM_PCT" -lt 70 ]; then
        MEM_COLOR="${C_GREEN}"
    elif [ "$MEM_PCT" -lt 85 ]; then
        MEM_COLOR="${C_YELLOW}"
    else
        MEM_COLOR="${C_RED}"
    fi

    SWAP_TOTAL=$(free -m | awk '/^Swap:/{print $2}')
    SWAP_USED=$(free -m | awk '/^Swap:/{print $3}')

    echo -e "   • ${C_GRAY}RAM Usada:${C_RESET} ${MEM_COLOR}${MEM_USED} MB / ${MEM_TOTAL} MB (${MEM_PCT}% em uso)${C_RESET} (Disponível: ${MEM_AVAIL} MB)"
    echo -e "   • ${C_GRAY}Swap:${C_RESET} ${SWAP_USED} MB / ${SWAP_TOTAL} MB"
else
    echo -e "   • ${C_RED}Comando free não encontrado.${C_RESET}"
fi

# 4. Disco (Armazenamento / HD)
echo -e "\n${C_BOLD}💾 ARMAZENAMENTO (DISCO / HD):${C_RESET}"
ROOT_DISK=$(df -h / | awk 'NR==2 {print $2 "|" $3 "|" $4 "|" $5}')
DISK_TOTAL=$(echo "$ROOT_DISK" | cut -d'|' -f1)
DISK_USED=$(echo "$ROOT_DISK" | cut -d'|' -f2)
DISK_AVAIL=$(echo "$ROOT_DISK" | cut -d'|' -f3)
DISK_PCT_STR=$(echo "$ROOT_DISK" | cut -d'|' -f4)
DISK_PCT=$(echo "$DISK_PCT_STR" | tr -d '%')

if [ "$DISK_PCT" -lt 75 ]; then
    DISK_COLOR="${C_GREEN}"
elif [ "$DISK_PCT" -lt 90 ]; then
    DISK_COLOR="${C_YELLOW}"
else
    DISK_COLOR="${C_RED}"
fi

echo -e "   • ${C_GRAY}Partição Raiz (/):${C_RESET} ${DISK_COLOR}${DISK_USED} usado de ${DISK_TOTAL} (${DISK_PCT_STR})${C_RESET} (Livre: ${DISK_AVAIL})"

# 5. Containers Docker
echo -e "\n${C_BOLD}🐳 DOCKER & CONTAINERS:${C_RESET}"
if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
        RUNNING_CONTAINERS=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
        if [ -n "$RUNNING_CONTAINERS" ] && [ "$(echo "$RUNNING_CONTAINERS" | wc -l)" -gt 1 ]; then
            echo -e "${C_GREEN}   ✓ Docker está ativo e rodando containers:${C_RESET}"
            docker ps --format "     • {{.Names}} [{{.Status}}] -> {{.Ports}}" 2>/dev/null
        else
            echo -e "${C_YELLOW}   ⚠️ Docker está ativo, mas nenhum container está rodando no momento.${C_RESET}"
        fi
    else
        echo -e "${C_RED}   ✖ Docker instalado, mas sem permissão ou daemon parado (tente rodar com sudo).${C_RESET}"
    fi
else
    echo -e "${C_RED}   ✖ Docker não encontrado.${C_RESET}"
fi

# 6. Alertas / Saúde do Sistema
echo -e "\n${C_BOLD}🩺 AVISOS & SAÚDE:${C_RESET}"
HAS_ALERTS=0
if [ -f /var/run/reboot-required ]; then
    echo -e "   ${C_YELLOW}⚠️  Aviso:${C_RESET} Reinicialização do sistema pendente (atualizações de kernel do Ubuntu)."
    HAS_ALERTS=1
fi

if [ "$DISK_PCT" -ge 85 ]; then
    echo -e "   ${C_RED}⚠️  Alerta de Disco:${C_RESET} O espaço em disco está acima de 85%."
    HAS_ALERTS=1
fi

if [ "$MEM_PCT" -ge 90 ]; then
    echo -e "   ${C_RED}⚠️  Alerta de Memória:${C_RESET} A RAM está acima de 90% de uso."
    HAS_ALERTS=1
fi

if [ "$HAS_ALERTS" -eq 0 ]; then
    echo -e "   ${C_GREEN}✅ Tudo 100% saudável! Sem alertas de sobrecarga ou disco cheio.${C_RESET}"
fi

echo -e "\n${C_CYAN}======================================================${C_RESET}\n"
