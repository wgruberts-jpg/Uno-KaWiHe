# 🃏 Uno KaWiHe v2.2.3 — Multiplayer, Duplas 2v2, Torneios & Voz P2P

> Plataforma Full-Stack de UNO Multiplayer em Tempo Real com Chat de Voz P2P (WebRTC), Modo Duplas 2v2, Sistema de Torneios, Contas Privadas por Convite, Painel Administrativo Seguro (JWT) e Persistência Atômica.

---

## 🚀 Destaques da Versão 2.2.3

- 🎮 **Multiplayer Autoritativo em Tempo Real:** Motor de regras centralizado (`server/unoEngine.ts`) com broadcast público (`GameState`) e envio privado de cartas (`HandState`) via WebSockets v2.
- 🤝 **Modo Duplas 2v2 (`team_2v2`):** Assentos alternados `[A1, B1, A2, B2]`, compartilhamento seguro da mão do parceiro (`teammateHand`), bloqueio de fogo amigo no `catch_uno` e pontuação pela equipe perdedora.
- 🏆 **Sistema de Torneios (`server/tournamentEngine.ts`):** Suporte a modalidades **Individual** (mesas 2..4, classificação por vitórias, desempate por partida extra ou decisão admin) e **Duplas 2v2** (chaveamento com byes e séries Md1/Md3/Md5 com *early clinch*), simulação pré-início, W.O. seguro preservando as 108 cartas e pausa automática em reinício de servidor.
- 🎙️ **Chat de Voz P2P (WebRTC Full-Mesh):** Comunicação por voz direta entre os jogadores na mesa, sem servidor de mídia pago no backend.
- 🔐 **Segurança & Autenticação Robusta:**
  - Autenticação e painel administrativo via **JSON Web Tokens (JWT)** assinados com verificação de perfil (`role === 'admin'`).
  - Bootstrap dinâmico com geração de credencial temporária de alta entropia (`crypto.randomBytes`) caso `INITIAL_ADMIN_PASSWORD` não seja informada.
  - Rate limiting composto por conta e IP (`trust proxy` + `CF-Connecting-IP`).
- 📁 **Persistência Atômica Sincronizada (`./data/`):** Dados salvos em `users.json`, `invites.json`, `stats.json`, `tournaments.json` e `import_batches.json` com escrita segura (`fsyncSync` + `renameSync`) e lock multi-processo (`data/.kawihe.lock`).
- 🛡️ **Scripts de Manutenção Seguros:**
  - `scripts/create-user.sh`: Exigência estrita de `bcryptjs` (fator 12), abortando com `process.exit(1)` caso ausente.
  - `scripts/backup.sh`: Permissões restritas (`chmod 700` no diretório e `chmod 600` nos arquivos gerados) com salvamento de `./data` e volumes Docker.
- 🧪 **Suíte de Testes Automatizados:** **109 testes** executados via Vitest em 9 suítes (`unoEngine`: 26, `serverIntegration`: 19, `tournamentEngine`: 22, `tournamentWo`: 19, `tournamentIntegration`: 5, `tournamentStress`: 2, `importParser`: 6, `importService`: 7, `importIntegration`: 3).
- 📥 **Importador de Usuários em Massa (JWT Admin):** Upload CSV ou colagem (até 512 KB / 200 registros) com hashing `bcrypt` em Worker Thread nativa, WAL (`running`/`completed`/`failed`/`partial`/`reconciling`) entre JSONs, inscrição direta em torneios individuais e gestão segura de ciclo de vida (`active`/`disabled`/`archived`/exclusão sem dependências).
- 👑 **Painel Administrativo, Diagnóstico e Monitor de VM:** Inspeção em tempo real de jogadores (`/api/admin/player-report/:target`), ações de moderação (Kick, Alerta, Desconectar, Redefinir Senha, Criar/Excluir Usuário) e métricas da VM (`/api/admin/vm-metrics`).
- 🎙️ **Guia de Microfone no PC:** Instruções passo a passo integradas para liberação de áudio e microfone em HTTP/IP no Firefox (`about:config`) e Google Chrome (`chrome://flags`).

---

## 📚 Documentação do Projeto

- 🤖 [**AGENTS.md**](./AGENTS.md) — Briefing obrigatório para Agentes (regras de ouro, autoridade do servidor e AI Studio Free Tier).
- 📜 [**00_visao.md**](./00_visao.md) a [**09_prompts.md**](./09_prompts.md) — Especificação modular de contrato, arquitetura, regras, testes e prompts prontos.
- 🃏 [**GAME_MANUAL.md**](./GAME_MANUAL.md) — Manual oficial de regras do jogo, cartas especiais, penalidades de UNO e proteções infantis.
- 📄 [**SYSTEM_SPECIFICATION.md**](./SYSTEM_SPECIFICATION.md) — Especificação técnica completa de arquitetura, envelopes de WebSocket v2, reconexão segura e persistência.
- 🛠️ [**manualSH.md**](./manualSH.md) — Manual completo dos scripts shell de deploy, backup e administração.
- 📊 [**USE_CASES.md**](./USE_CASES.md) — Mapeamento detalhado dos fluxos de uso, segurança e cenários de teste do sistema.
- ⚖️ [**Game_funcionalidades**](./Game_funcionalidades) — Contrato normativo de regras e comportamento.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide React.
- **Backend:** Node.js, Express, WebSockets (`ws`), TypeScript (`tsx`).
- **Criptografia:** `bcryptjs`, `jsonwebtoken`, `crypto` nativo do Node.js.
- **Testes:** Vitest.
- **Deploy:** Docker, Docker Compose.

---

## 🏃 Como Rodar Localmente

### 1. Clonar e Instalar Dependências
```bash
git clone <URL_DO_REPOSITORIO>
cd uno-game
npm install
```

### 2. Configurar Variáveis de Ambiente
Crie um arquivo `.env` baseado no `.env.example`:
```bash
cp .env.example .env
```
Defina sua chave secreta no `.env`:
```env
JWT_SECRET="sua_chave_secreta_longa_e_aleatoria_aqui"
INITIAL_ADMIN_PASSWORD="sua_senha_forte_para_admin"
```

### 3. Iniciar em Modo de Desenvolvimento
```bash
npm run dev
```
Acesse em: `http://localhost:3000`

---

## 🧪 Executar Testes Automatizados

```bash
# Executa os 109 testes com relatório detalhado
npm test

# Validação estrita de tipos TypeScript
npm run lint

# Compilação de produção
npm run build
```

---

## 👥 Scripts Administrativos e Manutenção

### Criar Novo Usuário via Linha de Comando
```bash
# Modo Interativo:
./scripts/create-user.sh

# Modo Direto:
./scripts/create-user.sh joao "minhasenha123" "João Silva" 🦁 player
./scripts/create-user.sh admin2 "senhaAdminForte" "Admin 2" 👑 admin
```

### Listar Usuários Cadastrados
```bash
./scripts/list-users.sh
```

### Fazer Backup Seguro
```bash
# Backup geral:
./backup.sh

# Backup com identificador / tag:
./backup.sh antes_do_deploy
```

### Restaurar Backup
```bash
./restore.sh antes_do_deploy
```

---

## 🐳 Deploy com Docker Compose

```bash
# 1. Garanta que o arquivo .env contenha o JWT_SECRET
# 2. Inicie os serviços em segundo plano:
docker compose up -d --build

# 3. Verifique os logs:
docker compose logs -f
```

---

## 🔒 Licença e Privacidade

Projeto privado desenvolvido para momentos de lazer e diversão em família com máxima segurança, privacidade e controle autoritativo.
