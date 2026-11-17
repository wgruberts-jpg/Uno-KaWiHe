# 02 — Regras (contrato de comportamento)

Fonte de verdade das regras. Cada regra tem ID e status: **C** = CONFIRMADO, **P** = PROPOSTA, **?** = A CONFIRMAR.

## Princípios & AI Studio Free Tier
- **REG-FREE-01** **REGRA INQUEBRÁVEL:** O sistema deve rodar exclusivamente dentro do ambiente gratuito (Free Tier) do AI Studio. É proibido sugerir ou implementar serviços pagos, bancos de dados externos cobrados ou APIs pagas.
- **REG-AUT-01** Servidor é a única autoridade (cartas, mãos, deck, turnos, efeitos, pontuação, UNO, vitória, configurações, identidade, permissões).
- **REG-AUT-02** Cliente envia intenções (`play_card`, `draw`...), nunca estado.
- **REG-AUT-03** `playerId` enviado pelo cliente não é confiável; divergência com o socket → `PLAYER_MISMATCH`.
- **REG-AUT-04** Ação rejeitada não altera estado.

## Baralho e início
- **REG-BAR-01** 108 cartas: 0×4, 1–9×72, Skip/Reverse/+2×8 cada, Wild×4, Wild+4×4.
- **REG-BAR-02** Embaralhar no servidor; ordem do deck nunca vai ao cliente.
- **REG-INI-01** Mínimo 2 jogadores; 7 cartas cada.
- **REG-INI-02** Carta inicial `wild_draw_four` volta ao deck e outra é sorteada.
- **REG-INI-03** Regra da casa: carta especial inicial NÃO dispara efeito; coringa inicial fixa cor vermelha.

## Jogadas
- **REG-JOG-01** Carta jogável: mesma cor, ou mesmo tipo, ou mesmo valor. Wild sempre jogável.
- **REG-JOG-02** `activeColor` ∈ {red, blue, green, yellow}, nunca `wild`. Coringa exige `chosenColor`.
- **REG-JOG-03** `strictWildDrawFour`: quando ligado, Wild+4 é proibido se o jogador tiver a cor ativa.
- **REG-JOG-04** Reverse com 2 jogadores equivale a Skip.
- **REG-JOG-05** Deck esgotado: manter o topo do descarte e embaralhar o resto como novo deck.

## Compra e passar
- **REG-CMP-01** Uma compra por turno (`hasDrawnThisTurn`).
- **REG-CMP-02** Passar exige compra antes; senão `MUST_DRAW_FIRST`.

## Tempo
- **REG-TMP-01** `turnTimeLimit` em segundos; 0 = ilimitado; padrão 30.
- **REG-TMP-02** Ao estourar: se não comprou, compra 1 e passa; se já comprou, só passa.

## UNO
- **REG-UNO-01** Ao ficar com 1 carta, jogador fica vulnerável por `unoWindowMs` (5000ms).
- **REG-UNO-02** `call_uno` só pelo próprio jogador; válido com 1 carta.
- **REG-UNO-03** `catch_uno` só dentro da janela; alvo compra 2; não pode acusar a si mesmo (`UNO_SELF_CATCH`).
- **REG-UNO-04** Modo Kids (`autoUnoProtection`): grito automático.

## Protocolo WebSocket
- **REG-WS-01** Envelope com `protocolVersion: 2`; versão diferente → `UNSUPPORTED_VERSION`.
- **REG-WS-02** Ações levam `messageId`; repetição em 60s retorna o mesmo resultado.
- **REG-WS-03** `game_state` público (sem mãos/deck); `hand_state` privado ao dono.

## Identidade e reconexão
- **REG-ID-01** `reconnectToken` é secreto, não derivado do `playerId`, e obrigatório para reconectar.
- **REG-ID-02** Desconectado mantém assento, mão e score durante o grace period.
- **REG-ID-03** Sala sem humanos conectados é destruída após ~5 min.

## Modo Duplas 2v2 (Equipes)
- **REG-2V2-01** Modo 2v2 consiste em 4 jogadores divididos em Equipe A (Azul) e Equipe B (Laranja).
- **REG-2V2-02** Assentos alternados `[A1, B1, A2, B2]` para intercalar turnos entre equipes opostas.
- **REG-2V2-03** Visibilidade de cartas: cada membro da equipe recebe em tempo real pelo socket a mão do seu parceiro (`teammateHand`), mantendo cartas de adversários ocultas.
- **REG-2V2-04** Condição de vitória: a rodada encerra imediatamente quando qualquer membro da equipe zerar suas cartas (`player.hand.length === 0`), concedendo a vitória à dupla (`winnerTeam`).
- **REG-2V2-05** Pontuação da vitória: soma dos pontos das cartas restantes de ambos os adversários da equipe perdedora.
- **REG-2V2-06** Fogo amigo de UNO: bloqueado acusar ou penalizar o próprio parceiro via `catch_uno`.

## Torneios (`tournamentEngine.ts`)
- **REG-TOR-01** Criação, início, simulação e decisões administrativas de torneio exigem `role === 'admin'`.
- **REG-TOR-02** Individual distribui mesas de 2 a 4 jogadores de forma determinística (por `seed`); Duplas 2v2 usa chaveamento eliminatório em potência de 2 com byes e séries ímpares (Md1, Md3 ou Md5) com *early clinch*.
- **REG-TOR-03** Classificação individual na V1 ordena por vitórias; `roundPointsWon` é apenas informativo e **nunca** desempata. Empates na linha de corte exigem partida extra (`extra_match`) ou decisão admin (`admin_decision`).
- **REG-TOR-04** W.O. individual só se aplica a salas com `tournamentId` após `reconnectGraceMs`: remove o jogador, preserva as 108 cartas devolvendo sua mão (e eventual `stagedCardPlay`) abaixo do topo do descarte, e encerra com `void_insufficient_players` se restar menos de 2 ativos.
- **REG-TOR-05** Proibido W.O. individual em salas 2v2 (`team_2v2` / `doubles_elimination`); em duplas, desistência/W.O. de 1 integrante concede vitória da partida à equipe adversária.
- **REG-TOR-06** Em reinício do servidor com partidas em andamento, o torneio é pausado (`server_restart`) sem inventar vencedor automático.

## Admin e Segurança
- **REG-ADM-01** Rotas `/api/admin/*` exigem JWT com `role === 'admin'` (ou `ADMIN_PIN` apenas quando configurado explicitamente via variável de ambiente). Rotas do Importador (`/api/admin/import/*`) e gestão de torneios (`/api/tournaments/*`) exigem **exclusivamente** JWT válido (`role === 'admin'` para ações administrativas), rejeitando `x-admin-pin` isolado; `/api/admin/cli-status` exige validação admin (`403`); `POST /api/auth/login` exige senha verificada via bcrypt sem fallback de PIN.
- **REG-SEG-01** `JWT_SECRET` via ambiente em produção; senhas com bcrypt (fator 10 no cadastro/importação, 12 no bootstrap/CLI); rate limit por falhas de login (`5`/5min por conta, `20`/5min por IP), cadastro (`10`/10min por IP) e convites (`20`/5min por IP). Nenhuma cobrança ou dependência paga.

## Importador de Usuários em Massa e Ciclo de Vida (`importService.ts` + `dataLock.ts`)
- **REG-IMP-01** **Senha mínima padronizada:** mínimo de **4 caracteres** consistente entre cadastro público, criação administrativa, redefinição de senha, importação em massa e CLI.
- **REG-IMP-02** **DisplayName obrigatório e único:** modos de criação (`create_only`, `create_and_enroll`) exigem `displayName` (2–18 caracteres, normalizado em Unicode NFKC sem caracteres invisíveis/Bidi) e rejeitam duplicidade no sistema ou no mesmo lote (nunca usa `username` como fallback).
- **REG-IMP-03** **Torneios de duplas bloqueados na V1:** inscrição individual em lote é bloqueada em torneios `doubles` (`2v2`). Evolução futura prevista: importação explícita de equipes (`username;displayName;password;teamName`).
- **REG-IMP-04** **Limites operacionais:** máximo de **200 registros** por lote e **512 KB** por payload/arquivo; hashing `bcrypt` (rounds=10) executado em `worker_threads` nativa fora do mutex para manter o lag médio do Event Loop em ~10ms sem afetar partidas WebSocket.
- **REG-IMP-05** **Concorrência global (`data/.kawihe.lock`):** toda escrita em `DATA_DIR` (cadastro normal, cadastro admin, edição de perfil, reset de senha, importação, status e `auth-service`) é serializada por mutex FIFO em memória + file lock exclusivo `data/.kawihe.lock`.
- **REG-IMP-06** **Consistência entre arquivos JSON (WAL):** lotes utilizam idempotencyKey, proveniência (`createdByImportBatchId`, `createdByImportOperationId`), telemetria por item (`userOpStatus`, `enrollOpStatus`) e máquina de estados (`running` → `completed` | `failed` | `partial` | `reconciling`, mantendo `'in_progress'` apenas para leitura legada) em `data/import_batches.json` com checkpoint intermediário (`usersSaved`) e reconciliação automática na inicialização (`reconcileIncompleteImportBatches`).
- **REG-IMP-07** **Privacidade absoluta:** `import_batches.json`, trilhas de auditoria, logs e APIs jamais persistem ou retornam senhas em texto puro, `passwordHash` ou conteúdo bruto do CSV; estado de senhas na UI é limpo após o commit.
- **REG-IMP-08** **Ciclo de vida de contas (`active` | `disabled` | `archived`):** contas desativadas ou arquivadas são bloqueadas em login (HTTP 403), `/api/auth/me`, validação de JWT (`getUserFromToken`), handshake WebSocket (close `4003`), criação/entrada em salas, reconexão (`sync_session`) e inscrições em torneios, mantendo histórico e estatísticas preservados.
- **REG-IMP-09** **Exclusão segura:** contas pré-existentes vinculadas via `enroll_existing` e contas `admin` são protegidas contra gestão pelo lote; exclusão só é permitida para contas criadas pelo lote (`created_by_batch`) sem histórico de partidas, torneios, salas ativas ou convites.

