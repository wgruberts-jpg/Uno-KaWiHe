#!/usr/bin/env bash
# ==============================================================================
# Script para Criar Usuários no Uno KaWiHe
# Pode ser executado de forma interativa ou passando os parâmetros:
# Uso rápido:
#   ./scripts/create-user.sh <usuario> <senha> [nome_exibicao] [avatar] [role] [pin_admin]
# Exemplo:
#   ./scripts/create-user.sh heitor 1234 "Heitor" 🦁 player
#   ./scripts/create-user.sh admin2 segredo "Super Admin" 👑 admin 1234
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

USERNAME="$1"
PASSWORD="$2"
DISPLAY_NAME="$3"
AVATAR="$4"
ROLE="$5"
ADMIN_PIN="$6"
INVITE_CODE="${7:-@KWH1}"

# Se não passou os argumentos, pergunta de forma interativa e amigável:
if [ -z "$USERNAME" ]; then
  echo "================================================================="
  echo "👤 CRIAR NOVO USUÁRIO - UNO KAWIHE"
  echo "================================================================="
  read -rp "👉 Nome de login (usuário, ex: maria, pedro): " USERNAME
fi

if [ -z "$PASSWORD" ]; then
  read -rsp "👉 Senha de acesso: " PASSWORD
  echo ""
fi

if [ -z "$DISPLAY_NAME" ]; then
  read -rp "👉 Nome de exibição no jogo (ex: Mariazinha, Campeão): " DISPLAY_NAME
  if [ -z "$DISPLAY_NAME" ]; then
    DISPLAY_NAME="$USERNAME"
  fi
fi

if [ -z "$AVATAR" ]; then
  echo "👉 Escolha um emoji para o avatar (ex: 🦊, 🦁, 🐼, 🐯, 🤖, 🦸‍♂️, 👑): "
  read -rp "Avatar [padrão: 🦸‍♂️]: " AVATAR
  if [ -z "$AVATAR" ]; then
    AVATAR="🦸‍♂️"
  fi
fi

if [ -z "$ROLE" ]; then
  echo "👉 Tipo de conta:"
  echo "   1) Jogador comum (padrão)"
  echo "   2) Administrador (pode usar painel e trapaças com PIN)"
  read -rp "Escolha (1 ou 2) [1]: " ROLE_CHOICE
  if [ "$ROLE_CHOICE" = "2" ]; then
    ROLE="admin"
    read -rp "👉 Digite o PIN de Administrador (padrão é 774007): " ADMIN_PIN
  else
    ROLE="player"
  fi
fi

if [ "$ROLE" = "admin" ] && [ -z "$ADMIN_PIN" ]; then
  ADMIN_PIN="774007"
fi

# Cria a requisição JSON
JSON_PAYLOAD=$(cat <<EOF
{
  "username": "${USERNAME}",
  "password": "${PASSWORD}",
  "displayName": "${DISPLAY_NAME}",
  "avatar": "${AVATAR}",
  "role": "${ROLE}",
  "adminSecret": "${ADMIN_PIN}",
  "inviteCode": "${INVITE_CODE}"
}
EOF
)

# Tenta chamar a API do Auth Service (Porta 4000 do container ou porta 3000 do Uno)
AUTH_URL=""
if curl -s --max-time 1 http://localhost:4000/health >/dev/null 2>&1; then
  AUTH_URL="http://localhost:4000/api/auth/register"
elif curl -s --max-time 1 http://localhost:3000/health >/dev/null 2>&1; then
  AUTH_URL="http://localhost:3000/api/auth/register"
fi

if [ -n "$AUTH_URL" ]; then
  RESPONSE=$(curl -s -X POST "${AUTH_URL}" \
    -H "Content-Type: application/json" \
    -d "${JSON_PAYLOAD}")

  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo ""
    echo "✅ SUCESSO! Usuário criado com êxito!"
    echo "   👤 Usuário: ${USERNAME}"
    echo "   🏷️  Nome:    ${DISPLAY_NAME}"
    echo "   🎭 Avatar:  ${AVATAR}"
    echo "   🛡️  Role:    ${ROLE}"
    echo "Agora você já pode fazer login na interface web!"
  else
    ERROR_MSG=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo ""
    echo "❌ Erro ao criar usuário: ${ERROR_MSG:-$RESPONSE}"
    exit 1
  fi
else
  # Se os containers não estiverem rodando no momento, executa via node localmente
  echo "ℹ️  Containers não estão respondendo na porta 4000/3000."
  echo "Criando diretamente no banco de dados local (data/users.json)..."
  mkdir -p data
  node -e "
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const file = path.join(process.cwd(), 'data', 'users.json');
    let users = [];
    if (fs.existsSync(file)) {
      try { users = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
    }
    const cleanUser = '${USERNAME}'.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanUser)) {
      console.error('❌ Erro: Usuário já existe!');
      process.exit(1);
    }
    // bcrypt sync via node or hash fallback
    let bcrypt;
    try { bcrypt = require('bcryptjs'); } catch {}
    const hash = bcrypt ? bcrypt.hashSync('${PASSWORD}', 10) : '${PASSWORD}';
    users.push({
      id: 'usr_' + Date.now(),
      username: cleanUser,
      passwordHash: hash,
      displayName: '${DISPLAY_NAME}',
      avatar: '${AVATAR}',
      role: '${ROLE}',
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf-8');
    console.log('✅ Usuário ${USERNAME} salvo diretamente em data/users.json!');
  "
fi
