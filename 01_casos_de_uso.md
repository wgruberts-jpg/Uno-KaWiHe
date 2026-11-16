# 01 — Casos de uso

Papéis globais: **Visitante**, **Registrado**, **Admin**. Papéis na sala: **Host**, **Jogador**, **Bot**, **Espectador**.

## Menu / Lobby
- **UC-MEN-01 Criar sala** — qualquer conexão válida define configurações e vira host.
- **UC-MEN-02 Entrar por código** — valida sala, vaga, nome, partida em andamento.
- **UC-MEN-03 Explorar salas abertas** — lista salas públicas (código, host, ocupação, tempo de turno).
- **UC-MEN-04 Treino solo** — sala com bots.
- **UC-MEN-05 Cadastro** — exige convite válido (código com `@`); limite de tentativas por IP.
- **UC-MEN-06 Login** — gera JWT assinado.

## Sala
- **UC-SAL-01 Configurar sala** (host).
- **UC-SAL-02 Iniciar partida** (host, mínimo 2 jogadores).
- **UC-SAL-03 Expulsar jogador** (host).
- **UC-SAL-04 Transferir host** (para humano conectado).
- **UC-SAL-05 Entrar como espectador** (se permitido).
- **UC-SAL-06 Reconectar** — `sync_session` + `reconnectToken` restaura estado e mão.
- **UC-SAL-07 Sala vazia é destruída** após período sem humanos conectados.

## Mesa
- **UC-MES-01 Jogar carta** (escolher cor se coringa).
- **UC-MES-02 Comprar carta e passar a vez**.
- **UC-MES-03 Estouro do tempo** — servidor compra 1 e passa.
- **UC-MES-04 Gritar UNO** (ou automático no Modo Kids).
- **UC-MES-05 Acusar UNO** — penalidade de 2 cartas.
- **UC-MES-06 Fim da rodada** — pontuação e estatísticas.

## Chat e voz
- **UC-CHT-01 Enviar mensagem** (200 caracteres, sanitizada).
- **UC-CHT-02 Enviar emote** (somente IDs oficiais).
- **UC-CHT-03 Voz** — sinalização WebRTC P2P entre jogadores da mesma sala.
- **UC-CHT-04 Modo Kids** restringe chat, emotes e voz.

## Modo Duplas 2v2
- **UC-2V2-01 Montar mesa 2v2** — 4 assentos alternados `[A1, B1, A2, B2]`.
- **UC-2V2-02 Compartilhar mão do parceiro** — cada membro recebe `teammateHand` via socket privado.
- **UC-2V2-03 Vitória e pontuação em equipe** — encerra quando qualquer parceiro zera a mão; soma apenas cartas dos 2 adversários; proíbe `catch_uno` no parceiro.

## Torneios (`TournamentModal` + `/api/tournaments/*`)
- **UC-TOR-01 Criar e simular torneio (Admin)** — modalidades Individual (mesas 2..4) ou Duplas 2v2 (Md1/Md3/Md5) com simulação pré-início.
- **UC-TOR-02 Inscrever participantes/duplas** — jogadores individuais ou equipes de 2 usuários distintos sem repetição.
- **UC-TOR-03 Iniciar jogos e avançar rodadas** — cria salas vinculadas (`tournamentId`), registra resultado e avança grupos/chaves com suporte a byes e *early clinch*.
- **UC-TOR-04 Desempate** — partida extra (`extra_match`) ou decisão administrativa (`admin_decision`), nunca por `roundPointsWon` na V1.
- **UC-TOR-05 W.O. e recuperação pós-reinício** — remoção segura de desconectado em torneio individual após `reconnectGraceMs`, devolvendo cartas ao descarte sem violar as 108 cartas; pausa automática se o servidor reiniciar durante partidas ativas.

## Admin (JWT com `role === 'admin'`)
- **UC-ADM-01 Gerenciar usuários** — listar, criar diretamente, redefinir senha e excluir (exceto `edinho`).
- **UC-ADM-02 Gerenciar convites** — gerar e revogar.
- **UC-ADM-03 Monitorar salas e enviar alertas** — listar, enviar mensagem/broadcast, expulsar ou fechar sala.
- **UC-ADM-04 Relatório de jogador** — `/api/admin/player-report/:target`.
- **UC-ADM-05 Moderar** — expulsar da sala, derrubar sessão WebSocket, enviar alerta direto.
- **UC-ADM-06 Monitor de VM** — `/api/admin/vm-metrics` com telemetria de CPU, RAM, disco e saúde.

## Importador de Usuários em Massa (`AdminImportPanel` + `AdminImportHistoryPanel`)
- **UC-IMP-01 Validar e importar lote (Modo A `create_only`)** — upload de CSV ou colagem de texto (até 512 KB / 200 registros) com pré-validação linha a linha, exigência de `displayName` único (NFKC) e senha mínima de 4 caracteres, sem vínculo obrigatório com torneio.
- **UC-IMP-02 Importar e inscrever em torneio individual (Modos B e C)** — `create_and_enroll` (cria novas contas e inscreve) ou `enroll_existing` (inscreve contas existentes em torneio `individual` em `registration`), bloqueando torneios `doubles` nesta v1.
- **UC-IMP-03 Consultar histórico e auditoria de lotes** — listagem filtrável por busca/modo/status e visão detalhada separando `created_by_batch` vs `existing_enrolled_only`, sem expor senhas ou hashes.
- **UC-IMP-04 Gerenciar ciclo de vida pós-importação** — análise prévia de impacto (`/users/impact`), desativação (`disabled`), arquivamento (`archived`), reativação (`active`) com desconexão imediata de WebSockets ativos, e exclusão segura permitida apenas quando não há dependências históricas.

