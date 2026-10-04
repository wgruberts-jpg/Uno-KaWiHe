# 📑 GAME_CHANGES.MD — TRANSIÇÃO E EVOLUÇÃO UNO KAWIHE v2.2

Este documento descreve a auditoria técnica, tabela de comportamentos observados, correções de segurança aplicadas, soluções de cada etapa e matriz de testes do **Uno KaWiHe v2.2**.

---

## 🔍 Tabela de Comportamento Atual e Mapeamento de Regras (Auditoria)

| Regra / Item | Comportamento Atual no Código | Especificação v2.2 | Estado de Implementação |
| :--- | :--- | :--- | :--- |
| **Passar Vez (`pass_turn`)** | Exige `hasDrawnThisTurn === true`. Rejeita com `MUST_DRAW_FIRST` se não comprou. | Exige compra prévia antes de passar. | ✅ Implementado & Autoritativo |
| **Janela do UNO (`unoWindowMs`)** | Exige declaração `call_uno` para mão de 1 carta. Aplica 2 cartas de penalidade no `catch_uno`. | Janela estrita e autoritativa. Bloqueia `UNO_SELF_CATCH`. | ✅ Implementado & Autoritativo |
| **Reconexão Resiliente (`sync_session`)** | **Exige obrigatoriamente `reconnectToken` secreto.** Impede usurpação de `playerId` público. | `reconnectToken` obrigatório para reatar sessão. | ✅ Implementado & Autoritativo |
| **Cor Ativa (`activeColor`)** | `activeColor` é enviada no `GameState` e nunca pode ser `'wild'`. | `activeColor` sempre válida (`red/blue/green/yellow`). | ✅ Implementado & Autoritativo |
| **Idempotência & Cache** | `processedMessageCache` com janela de 60s, chaveada por `messageId` e retornando `action_ack` ou resultado em cache. | Envelope `protocolVersion: 2` + `messageId`. | ✅ Implementado & Autoritativo |
| **Deck Esgotado** | Preserva a carta superior do descarte e re-embaralha as demais com cores de coringas resetadas para `'wild'`. | Reciclagem de descarte mantendo top card e cores das cartas coloridas. | ✅ Implementado & Autoritativo |
| **Normalização de Nomes** | Normalização Unicode NFKC, remoção de caracteres Bidi, Zero-Width e colapso de espaços. | NFKC + higienização contra Bidi spoofing. | ✅ Implementado & Autoritativo |
| **Persistência Atômica** | Escrita segura com `openSync` + `writeSync` + `fsyncSync` + `renameSync` (Garantia de gravação no disco). | Gravação temporária + `fsync` + `rename`. | ✅ Implementado & Autoritativo |
| **Sanitização WebRTC** | `fromPlayerId` forçado pelo socket autoritativo, impedindo personificação em sinalização P2P. | Zero trust no `fromPlayerId` do cliente. | ✅ Implementado & Autoritativo |
| **Timer de Turno Ajustado** | Se o tempo esgotar e o jogador já comprou (`hasDrawnThisTurn === true`), apenas passa a vez sem comprar segunda carta. | Previne compra dupla forçada ao estourar o tempo. | ✅ Implementado & Autoritativo |

---

## 🚀 Roteiro de Ordem e Execução Detalhado (Passos 1 ao 8)

### 1. **Passo 1: Tabela de Comportamento Atual & Validação de Regras do Motor [CONCLUÍDO]**
   - **O que foi identificado:** Necessidade de mapear a fundo a lógica de baralho, descarte, penalidades e contagem de pontos no motor autoritativo.
   - **O que foi feito para resolver:**
     - Auditoria completa dos arquivos `server/unoEngine.ts`, `server.ts` e `server/authService.ts`.
     - Confirmação do funcionamento de 108 cartas, regras de pontuação de vitoria (soma das mãos dos perdedores) e reciclagem do descarte.

### 2. **Passo 2: Envelope Versionado, Idempotência & Exigência do ReconnectToken [CONCLUÍDO]**
   - **O que foi identificado:** Risco de usurpação de `playerId` em reconexões simples e ausência de garantia contra reprocessamento de mensagens duplicadas por latência de rede.
   - **O que foi feito para resolver:**
     - Implementação de envelope WebSocket com `protocolVersion: 2` e `messageId`.
     - Criação do `processedMessageCache` com janela de retenção de 60 segundos para responder a `messageId` idênticos sem re-executar ações no servidor.
     - Associação estrita de `socketId` com `playerId`.
     - Exigência de um token secreto `reconnectToken` (gerado e salvo em `sessionStorage`) no comando `sync_session`. Rejeição com erro `NOT_AUTHENTICATED` se o token estiver ausente ou inválido.

### 3. **Passo 3: Separação de Estado Autoritativo (GameState Público x HandState Privado) [CONCLUÍDO]**
   - **O que foi identificado:** Antigo vazamento de cartas da mão no broadcast global do objeto `GameState`, permitindo inspecionar cartas de adversários no DevTools.
   - **O que foi feito para resolver:**
     - Reformulação do evento de broadcast `GameState`: o servidor envia apenas a contagem estática de cartas (`cardsCount`) de cada oponente.
     - Implementação do evento privado unicast **`hand_state`**, enviado apenas no socket individual de cada jogador contendo `hand` (seus objetos de cartas), `playableCardIds` (cartas autorizadas a jogar), `canDraw` e `canPassTurn`.
     - Injeção direta no `GameBoard.tsx` sem expor dados a outros clientes.

### 4. **Passo 4: Validações Estritas de Ação, `activeColor` e Respostas Estruturadas [CONCLUÍDO]**
   - **O que foi identificado:** Risco de `activeColor` assumir valor inválido (`'wild'`) e falta de validações rígidas para grito de UNO e passagem de turno.
   - **O que foi feito para resolver:**
     - Garantia de que `activeColor` seja sempre uma cor válida (`red`, `blue`, `green`, `yellow`).
     - Validação autoritativa em `pass_turn`: rejeita a passagem com o código `MUST_DRAW_FIRST` caso o jogador não tenha comprado uma carta no turno atual.
     - Proteção no `catch_uno`: rejeição com erro `UNO_SELF_CATCH` caso um jogador tente aplicar penalidade a si próprio.
     - Suporte autoritativo à **Proteção Infantil (`autoUnoProtection`)**, onde o servidor realiza o grito de UNO automaticamente para crianças pequenas.

### 5. **Passo 5: Persistência Atômica com `fsync`, Sanitização WebRTC & Higienização Unicode [CONCLUÍDO]**
   - **O que foi identificado:** Risco de corrupção de arquivos JSON (`users.json`, `invites.json`, `stats.json`) em caso de desligamento abrupto e possibilidade de personificação em mensagens de voz WebRTC.
   - **O que foi feito para resolver:**
     - Implementação da função `atomicWriteFileSync` usando `openSync` + `writeSync` + `fsyncSync` + `renameSync` no disco rígido para garantir gravação física atômica.
     - Sanitização do campo `fromPlayerId` em sinais WebRTC (`webrtc_offer`, `webrtc_answer`, `webrtc_candidate`), sempre sobrescrevendo pelo ID autenticado do socket.
     - Normalização de nomes de exibição utilizando Unicode NFKC e remoção de caracteres Bidi e invisíveis.

### 6. **Passo 6: Ajuste Fino do Timer de Turno (`handleTurnTimeout`) [CONCLUÍDO]**
   - **O que foi identificado:** Se o tempo do turno esgotava após o jogador já ter feito a compra de 1 carta (`hasDrawnThisTurn === true`), o servidor incorretamente aplicava uma segunda compra forçada.
   - **O que foi feito para resolver:**
     - Ajuste na lógica de `handleTurnTimeout` em `server.ts`: se `hasDrawnThisTurn === true`, o servidor registra que o tempo acabou e **apenas passa o turno** sem adicionar nova carta. Caso o jogador ainda não tenha comprado, saca 1 carta e passa a vez.

### 7. **Passo 7: Suíte de Testes Automatizados Unitários (Vitest) [CONCLUÍDO]**
   - **O que foi identificado:** Ausência de suíte de testes unitários para validar automaticamente as regras do motor de jogo.
   - **O que foi feito para resolver:**
     - Instalação e configuração do `vitest` no projeto.
     - Adição do script `"test": "vitest run"` ao `package.json`.
     - Criação do arquivo `tests/unoEngine.test.ts` com **14 testes unitários automatizados** cobrindo a composição do baralho (108 cartas), regras de jogabilidade (`isCardPlayable`), navegação de turnos, reciclagem do descarte preservando cores de cartas normais, cálculo de pontuação e operações do motor.
     - Execução da suíte com 100% de aprovação (`14 passed`).

### 8. **Passo 8: Homologação Final de Build, Linter e Documentação Sincronizada [CONCLUÍDO]**
   - **O que foi feito para resolver:**
     - Execução do Linter TypeScript (`lint_applet`): `0 erros`.
     - Execução do Compilador Vite/React (`compile_applet`): Build aprovado com sucesso.
     - Atualização integrada e completa de todos os manuais e especificações do repositório (`GAME_MANUAL.md`, `SYSTEM_SPECIFICATION.md`, `USE_CASES.md`, `Game_changes.MD`).
