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

## Admin (JWT com `role === 'admin'`)
- **UC-ADM-01 Gerenciar usuários** — listar, redefinir senha.
- **UC-ADM-02 Gerenciar convites** — gerar e revogar.
- **UC-ADM-03 Monitorar salas** em tempo real.
- **UC-ADM-04 Relatório de jogador** — `/api/admin/player-report/:target`.
- **UC-ADM-05 Moderar** — expulsar da sala, derrubar sessão WebSocket, enviar alerta direto, redefinir senha.
