# 🃏 Uno KaWiHe v2.2 — Multiplayer & Voice P2P

> Plataforma Full-Stack de UNO Multiplayer em Tempo Real com Chat de Voz P2P (WebRTC), Sistema de Contas Privado com Convites, Painel Administrativo Seguro (JWT) e Persistência Atômica.

---

## 🚀 Destaques da Versão 2.2

- 🎮 **Multiplayer Autoritativo em Tempo Real:** Motor de regras centralizado com broadcast público (`GameState`) e envio privado de cartas (`HandState`) via WebSockets v2.
- 🎙️ **Chat de Voz P2P (WebRTC Full-Mesh):** Comunicação por voz direta entre os jogadores na mesa, sem sobrecarga de processamento ou servidor de mídia no backend.
- 🔐 **Segurança & Autenticação Robusta:**
  - Autenticação e painel administrativo 100% via **JSON Web Tokens (JWT)** assinados com verificação de perfil (`role === 'admin'`).
  - **Zero senhas padrão hardcoded** no código-fonte.
  - Bootstrap dinâmico com geração de credencial temporária de alta entropia (`crypto.randomBytes`) caso `INITIAL_ADMIN_PASSWORD` não seja informada.
  - Fail-fast obrigatório de `JWT_SECRET` ao iniciar contêineres e serviços.
  - Rate limiting composto por conta e IP (`trust proxy` + `CF-Connecting-IP`).
- 📁 **Persistência Atômica:** Dados salvos em `./data/` utilizando escrita segura com `fsyncSync` + `renameSync`, garantindo consistência mesmo em quedas abruptas de energia.
- 🛡️ **Scripts de Manutenção Seguros:**
  - `scripts/create-user.sh`: Exigência estrita de `bcryptjs` (fator 12), abortando com `process.exit(1)` caso ausente (proibição absoluta de texto puro).
  - `scripts/backup.sh`: Permissões restritas (`chmod 700` no diretório e `chmod 600` nos arquivos gerados) com salvamento de `./data` e volumes Docker.
- 🧪 **Suíte de Testes Automatizados:** 42 testes executados via Vitest (24 testes unitários de regras de jogo e 18 testes de integração e segurança de rede).
- 👑 **Painel Administrativo & Diagnóstico de Jogadores:** Inspeção em tempo real de jogadores ativos e mensagens de chat pelo Admin, exibindo relatório detalhado de localização, IP, dispositivo e histórico, além de ações de moderação (Kick, Alerta, Desconectar, Redefinir Senha).
- 🎙️ **Guia de Microfone no PC:** Instruções passo a passo integradas para liberação de áudio e microfone em HTTP/IP no Firefox (`about:config`) e Google Chrome (`chrome://flags`).

---

## 📚 Documentação do Projeto

- 🃏 [**GAME_MANUAL.md**](./GAME_MANUAL.md) — Manual oficial de regras do jogo, cartas especiais, penalidades de UNO e proteções infantis.
- 📄 [**SYSTEM_SPECIFICATION.md**](./SYSTEM_SPECIFICATION.md) — Especificação técnica completa de arquitetura, envelopes de WebSocket v2, reconexão segura e persistência.
- 📊 [**USE_CASES.md**](./USE_CASES.md) — Mapeamento detalhado dos fluxos de uso, segurança e cenários de teste do sistema.

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
# Executa os 38 testes com relatório detalhado
npm test

# Validação estrita de tipos TypeScript
npx tsc --noEmit

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
