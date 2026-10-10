# 📖 MANUAL DE SCRIPTS SHELL (MANUALSH.md) — UNO KAWIHE v2.2

Este manual documenta todos os scripts utilitários em Shell Script (`.sh`) criados no ecossistema do **Uno KaWiHe v2.2**. Eles foram desenvolvidos para automatizar operações de deploy, gerenciamento de usuários, backups seguros, restaurações, monitoramento de saúde da Máquina Virtual (VM) e túneis HTTPS com Cloudflare.

---

## 📋 Sumário de Scripts Disponíveis

| Script | Localização | Descrição Principal |
| :--- | :--- | :--- |
| **`deploy.sh`** | Raiz / `scripts/deploy.sh` | Orquestrador completo de deploy em produção (Auto-backup + Git Pull + Docker Compose + Health Check). |
| **`create-user.sh`** | Raiz / `scripts/create-user.sh` | Criação segura de usuários administradores ou jogadores com hash `bcryptjs` (fator 12). |
| **`create-invite.sh`** | `scripts/create-invite.sh` | Geração de códigos de convite restritos (`@XXXX`) para registro de novos usuários. |
| **`backup.sh`** | Raiz / `scripts/backup.sh` | Ponto de restauração e salvamento de dados com permissões restritas (`chmod 700`/`600`). |
| **`restore.sh`** | Raiz / `scripts/restore.sh` | Restauração de banco de dados a partir de backups gerais ou tags específicas. |
| **`status.sh`** | Raiz / `scripts/status.sh` | Monitoramento rápido de saúde dos serviços (Portas 3000 / 4000). |
| **`sysinfo.sh`** | `scripts/sysinfo.sh` | Diagnóstico completo e interativo do sistema (CPU, Memória, Disco, Uptime, Docker). |
| **`list-users.sh`** | `scripts/list-users.sh` | Listagem em formato tabular de todos os usuários cadastrados e seus papéis (*admin* / *player*). |
| **`cloudflare.sh`** | `cloudflare.sh` | Gerenciador interativo de túnel Cloudflare Tunnel (HTTPS) para acesso externo à VM. |
| **`relatorio-vm.sh`** | `relatorio-vm.sh` | Ferramenta de diagnóstico em **somente leitura** para inspeção segura do estado da VM (mascara segredos). |

---

## 🛠️ Detalhes e Exemplos de Uso por Script

### 1. `deploy.sh` (Orquestrador de Deploy)
* **Objetivo:** Automatizar a atualização da aplicação na Máquina Virtual de produção de forma totalmente segura.
* **O que faz:**
  1. Cria um ponto de backup automático imediato (`backup.sh`).
  2. Puxa as últimas alterações do repositório Git (`git pull`).
  3. Reconstrói e reinicia os containers Docker (`docker compose up -d --build`).
  4. Executa verificação de saúde (*Health Check*).
* **Modos de Uso:**
  ```bash
  # Deploy completo (com backup prévio automático)
  ./deploy.sh

  # Visualizar logs em tempo real
  ./deploy.sh logs

  # Verificar status de execução
  ./deploy.sh status
  ```

---

### 2. `create-user.sh` (Criação de Usuários)
* **Objetivo:** Cadastrar novos usuários ou administradores no sistema sem permitir senhas em texto puro.
* **Segurança:** Exige o pacote `bcryptjs` instalado (fator de custo 12). Aborta com `process.exit(1)` caso ausente.
* **Modos de Uso:**
  ```bash
  # Modo Interativo (pergunta usuário, senha, nome, avatar e papel)
  ./create-user.sh

  # Modo Direto por Argumentos:
  # Sintaxe: ./create-user.sh <username> <senha> <nome_exibicao> <avatar> <role>
  ./scripts/create-user.sh edinho "minhasenha123" "Edinho Admin" 👑 admin
  ./scripts/create-user.sh joao "joao1234" "João da Silva" 🦁 player
  ```

---

### 3. `create-invite.sh` (Gerador de Convites)
* **Objetivo:** Gerar códigos de convite restritos (ex: `@KWH99`) necessários para novos cadastros.
* **Modos de Uso:**
  ```bash
  # Gerar convite padrão
  ./scripts/create-invite.sh

  # Gerar convite personalizado com limite de usos e validade
  ./scripts/create-invite.sh @MINHA_EQUIPE 5
  ```

---

### 4. `backup.sh` (Ponto de Restauração)
* **Objetivo:** Salvar o diretório `./data/` (usuários, convites, estatísticas) em um diretório de backup com permissões restritas.
* **Segurança:** Aplica `chmod 700` no diretório de destino e `chmod 600` nos arquivos gerados, protegendo dados sensíveis de leitura por outros usuários do sistema.
* **Modo de Uso:**
  ```bash
  # Criar backup geral
  ./backup.sh

  # Criar backup com tag nomeada
  ./scripts/backup.sh versao_estavel_v2
  ```

---

### 5. `restore.sh` (Restauração de Dados)
* **Objetivo:** Reverter o banco de dados (`./data/`) para o estado de um backup anterior.
* **Modo de Uso:**
  ```bash
  # Restaurar o backup mais recente
  ./restore.sh

  # Restaurar a partir de uma tag nomeada
  ./scripts/restore.sh versao_estavel_v2
  ```

---

### 6. `status.sh` (Verificação de Saúde)
* **Objetivo:** Consultar rapidamente se os serviços do Uno KaWiHe estão ativos e respondendo.
* **Modo de Uso:**
  ```bash
  ./status.sh
  ```

---

### 7. `sysinfo.sh` (Diagnóstico do Sistema)
* **Objetivo:** Exibir estatísticas detalhadas de uso de CPU, memória RAM, espaço em disco, processos Node.js e status do Docker.
* **Modo de Uso:**
  ```bash
  ./scripts/sysinfo.sh
  ```

---

### 8. `list-users.sh` (Listagem de Contas)
* **Objetivo:** Exibir uma listagem formatada de todos os usuários registrados em `data/users.json`.
* **Modo de Uso:**
  ```bash
  ./scripts/list-users.sh
  ```

---

### 9. `cloudflare.sh` (Gerenciador de Túnel HTTPS)
* **Objetivo:** Expor a aplicação localmente de forma segura via túnel Cloudflare (`trycloudflare.com` ou domínio customizado) para habilitar HTTPS e WebRTC.
* **Modo de Uso:**
  ```bash
  ./cloudflare.sh
  ```

---

### 10. `relatorio-vm.sh` (Relatório Seguro em Somente Leitura)
* **Objetivo:** Gerar um relatório de diagnóstico da VM para fins de auditoria e solução de problemas.
* **Garantia de Segurança:** Executa estritamente em **somente leitura**, sem alterar nenhum arquivo ou container, mascarando senhas, chaves JWT e hashes.
* **Modo de Uso:**
  ```bash
  ./relatorio-vm.sh
  ```

---

## 🔒 Boas Práticas e Permissões
Para garantir que todos os scripts tenham permissão de execução correta na VM após clonar ou atualizar o repositório, execute:
```bash
chmod +x *.sh scripts/*.sh
```
