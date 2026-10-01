#!/usr/bin/env bash
# ==============================================================================
# Script para Gerar Convites no Terminal da VM
# Uso:
#   ./scripts/create-invite.sh [horas_validade] [limite_usos] [codigo_customizado]
# Exemplo:
#   ./scripts/create-invite.sh 24 1
#   ./scripts/create-invite.sh 48 5 @FAMI
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"

HOURS="${1:-24}"
USES="${2:-1}"
CUSTOM_CODE="$3"

mkdir -p data
INVITES_FILE="data/invites.json"

node -e "
  const fs = require('fs');
  const path = require('path');
  const file = path.join(process.cwd(), 'data', 'invites.json');
  let invites = [];
  if (fs.existsSync(file)) {
    try { invites = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
  }

  let code = '${CUSTOM_CODE}'.trim().toUpperCase();
  if (code) {
    if (!code.startsWith('@')) code = '@' + code;
    code = code.slice(0, 5);
  } else {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = '@' + rand;
  }

  const hours = Number('${HOURS}') || 24;
  const expiresAt = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : 'never';
  const maxUses = Number('${USES}') || 1;

  const newInvite = {
    code,
    createdBy: 'Edinho (Terminal)',
    createdAt: new Date().toISOString(),
    expiresAt,
    maxUses,
    usedCount: 0,
    usedBy: [],
    status: 'active'
  };

  invites.unshift(newInvite);
  fs.writeFileSync(file, JSON.stringify(invites, null, 2), 'utf-8');

  console.log('=================================================================');
  console.log('🎟️  NOVO CONVITE GERADO COM SUCESSO!');
  console.log('=================================================================');
  console.log('👉 Código:', code);
  console.log('⏱️  Validade:', hours > 0 ? hours + ' horas (' + new Date(expiresAt).toLocaleString('pt-BR') + ')' : 'Sem expiração');
  console.log('👥 Usos permitidos:', maxUses);
  console.log('🔗 Link Direto: http://<IP_DA_VM>:3000/?invite=' + encodeURIComponent(code));
  console.log('=================================================================');
"
