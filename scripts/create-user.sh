#!/usr/bin/env bash
# ==============================================================================
# Script para Criar Usuários no Uno KaWiHe
# Pode ser executado de forma interativa ou passando os parâmetros:
# Uso rápido:
#   ./scripts/create-user.sh <usuario> <senha> [nome_exibicao] [avatar] [role]
# Exemplo:
#   ./scripts/create-user.sh heitor 123456 "Heitor" 🦁 player
#   ./scripts/create-user.sh admin2 segredo "Super Admin" 👑 admin
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

USERNAME="$1"
PASSWORD="$2"
DISPLAY_NAME="$3"
AVATAR="$4"
ROLE="$5"

# Se não passou os argumentos, pergunta de forma interativa e amigável:
if [ -z "$USERNAME" ]; then
  echo "================================================================="
  echo "👤 CRIAR NOVO USUÁRIO - UNO KAWIHE"
  echo "================================================================="
  read -rp "👉 Nome de login (usuário, ex: maria, pedro): " USERNAME

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
    echo "   2) Administrador"
    read -rp "Escolha (1 ou 2) [1]: " ROLE_CHOICE
    if [ "$ROLE_CHOICE" = "2" ]; then
      ROLE="admin"
    else
      ROLE="player"
    fi
  fi
else
  # Argumentos passados via linha de comando
  if [ -z "$PASSWORD" ]; then
    read -rsp "👉 Senha de acesso para $USERNAME: " PASSWORD
    echo ""
  fi
  DISPLAY_NAME="${DISPLAY_NAME:-$USERNAME}"
  AVATAR="${AVATAR:-🦁}"
  ROLE="${ROLE:-player}"
fi

# Cria diretamente no banco de dados local com escrita atômica
echo "Criando diretamente no banco de dados local (data/users.json)..."
mkdir -p data
node -e "
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  let bcrypt;
  try {
    bcrypt = require('bcryptjs');
  } catch (err1) {
    try {
      bcrypt = require('bcrypt');
    } catch (err2) {
      console.error('❌ ERRO FATAL: O módulo bcryptjs (ou bcrypt) não está instalado no ambiente.');
      console.error('❌ A criação do usuário foi ABORTADA. Senhas em texto puro são estritamente proibidas!');
      process.exit(1);
    }
  }

  const file = path.join(process.cwd(), 'data', 'users.json');
  let users = [];
  if (fs.existsSync(file)) {
    try {
      users = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error('❌ Erro ao ler arquivo data/users.json:', e.message);
      process.exit(1);
    }
  }
  const username = (process.argv[1] || '').trim().toLowerCase();
  const password = process.argv[2] || '';
  const displayName = process.argv[3] || username;
  const avatar = process.argv[4] || '🦸‍♂️';
  const role = process.argv[5] || 'player';

  if (!username || username.length < 2) {
    console.error('❌ Erro: Nome de usuário deve ter pelo menos 2 caracteres!');
    process.exit(1);
  }

  if (!password || password.trim().length < 4) {
    console.error('❌ Erro: Senha deve ter pelo menos 4 caracteres!');
    process.exit(1);
  }

  if (users.some(u => u.username.toLowerCase() === username)) {
    console.error('❌ Erro: Usuário já existe!');
    process.exit(1);
  }

  // Gera o hash criptográfico com fator de custo 12
  const hash = bcrypt.hashSync(password, 12);
  if (!hash || typeof hash !== 'string' || hash === password || hash.length < 20) {
    console.error('❌ ERRO CRÍTICO: Falha na geração do hash bcrypt da senha!');
    process.exit(1);
  }

  const tag = '#' + crypto.randomInt(1000, 10000);
  users.push({
    id: 'usr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    username: username,
    passwordHash: hash,
    displayName: displayName,
    avatar: avatar,
    role: role === 'admin' ? 'admin' : 'player',
    tag: tag,
    createdAt: new Date().toISOString()
  });

  const tempPath = file + '.tmp.' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  const fd = fs.openSync(tempPath, 'w');
  fs.writeSync(fd, JSON.stringify(users, null, 2), 0, 'utf-8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tempPath, file);

  console.log('✅ Usuário ' + username + ' (' + role + ') criado com sucesso em data/users.json com hash bcrypt seguro!');
" "$USERNAME" "$PASSWORD" "$DISPLAY_NAME" "$AVATAR" "$ROLE"
