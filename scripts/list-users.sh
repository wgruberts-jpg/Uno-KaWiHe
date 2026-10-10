#!/usr/bin/env bash
# ==============================================================================
# Script para Listar Usuários Cadastrados no Uno KaWiHe
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

USERS_FILE="${PROJECT_DIR}/data/users.json"

echo "================================================================="
echo "👥 USUÁRIOS CADASTRADOS NO UNO KAWIHE"
echo "================================================================="

if [ -f "$USERS_FILE" ]; then
  node -e "
    const fs = require('fs');
    try {
      const users = JSON.parse(fs.readFileSync('${USERS_FILE}', 'utf-8'));
      if (users.length === 0) {
        console.log('Nenhum usuário cadastrado ainda.');
      } else {
        console.log('Total de usuários:', users.length);
        console.log('-----------------------------------------------------------------');
        users.forEach((u, i) => {
          const roleBadge = u.role === 'admin' ? '👑 [ADMIN]' : '🎮 [JOGADOR]';
          const tagBadge = u.tag ? \` [\${u.tag}]\` : '';
          console.log(\`#\${i + 1} \${u.avatar} \${u.displayName}\${tagBadge} (@\${u.username}) \${roleBadge}\`);
          console.log(\`   ID: \${u.id} | Cadastrado em: \${new Date(u.createdAt).toLocaleString('pt-BR')}\`);
        });
      }
    } catch (e) {
      console.error('Erro ao ler arquivo de usuários:', e.message);
    }
  "
else
  echo "⚠️ Arquivo de banco de dados 'data/users.json' ainda não foi gerado."
  echo "O usuário inicial será gerado no primeiro boot da aplicação."
fi
echo "================================================================="
