# 📑 GAME_CHANGES.MD — TRANSIÇÃO E EVOLUÇÃO UNO KAWIHE v2.2

Este documento descreve a auditoria técnica, tabela de comportamentos observados (comparando v2.1 x v2.2), correções de segurança aplicadas, soluções de cada etapa e matriz de testes do **Uno KaWiHe v2.2**.

---

## 🔍 Tabela de Comportamento e Mapeamento de Regras (Auditoria v2.1 x v2.2)

| Regra / Item | Comportamento Original (v2.1) | Especificação v2.2 | Estado Atual / O que foi feito |
| :--- | :--- | :--- | :--- |
| **Passar Vez (`pass_turn`)** | Permitia passar a vez em qualquer momento sem forçar a compra. | Exige compra prévia antes de permitir passar a vez. | ✅ Implementado. Validação autoritativa em `server.ts` que rejeita a passagem com `MUST_DRAW_FIRST` se `hasDrawnThisTurn === false`. |
| **Janela do UNO (`unoWindowMs`)** | Vulnerabilidade ilimitada sem limpeza automática na troca de turno. | Janela estrita de vulnerabilidade que expira na troca de turno. | ✅ Implementado. `unoVulnerablePlayerId` é limpo automaticamente no `advanceTurn` ou quando `call_uno`/`catch_uno` são acionados. |
| **Reconexão Resiliente (`sync_session`)** | Aceitava reconexão fornecendo apenas o `playerId` público. | Exige token secreto `reconnectToken` para reatar a sessão. | ✅ Implementado. `reconnectToken` é gerado no `room_joined`, salvo no `sessionStorage` e exigido no `sync_session` (rejeitando sem token com `NOT_AUTHENTICATED`). |
| **Cor Ativa (`activeColor`)** | Poderia assumir o valor `'wild'` no estado inicial do jogo. | `activeColor` deve sempre ser uma cor jogável válida (`red/blue/green/yellow`). | ✅ Implementado. Coringas no topo do descarte inicial definem a cor como `'red'` por padrão e `activeColor` é forçada a ser uma cor válida. |
| **Idempotência & Cache** | Não havia controle de mensagens duplicadas via WebSocket. | Envelope `protocolVersion: 2` com `messageId` e cache de 60s. | ✅ Implementado. `processedMessageCache` previne reprocessamento de mensagens duplicadas por instabilidade de rede. |
| **Deck Esgotado** | Resetava as cores de todas as cartas no baralho reciclado para `'wild'`. | Mantém a cor original de cartas coloridas e reseta apenas Coringas (`wild`/`wild4`). | ✅ Implementado em `reshuffleDiscardIntoDeck`. Testado e validado via Vitest. |
| **Normalização de Nomes** | Aceitava qualquer string no nome de exibição. | Normalização Unicode NFKC + higienização contra Bidi spoofing. | ✅ Implementado em `authService.ts` e `server.ts`. |
| **Persistência Atômica** | Usava gravação de arquivo padrão assíncrona, suscetível a corrupção por queda de energia. | Escrita atômica física com `openSync` + `writeSync` + `fsyncSync` + `renameSync`. | ✅ Implementado em `atomicWriteFileSync`. |
| **Sanitização WebRTC** | Confiava no campo `fromPlayerId` vindo no payload do cliente. | Sobrescreve autoritativamente o `fromPlayerId` com o ID autenticado do socket. | ✅ Implementado nos manipuladores de `rtc_offer`, `rtc_answer` e `rtc_ice_candidate`. |
| **Timer de Turno Ajustado** | Forçava a compra de uma 2ª carta se o tempo esgotasse mesmo quando o jogador já tinha comprado. | Se o jogador já comprou (`hasDrawnThisTurn === true`), o estouro de tempo apenas passa a vez. | ✅ Implementado em `handleTurnTimeout` (`server.ts`). |
| **Primeira Carta Especial no Descarte** | Carta especial (Skip, Reverse, +2) inicial ficava no topo sem disparar efeito no Jogador 1. | Proposta v2.2 sugeria disparar efeito no Jogador 1. | 🏠 Mantida Regra da Casa v2.1 (carta neutra no topo). Evita alterar mecânica estabelecida do jogo. |
| **Primeira Carta Coringa no Descarte** | Coringa inicial fixa a cor inicial como Vermelho (`'red'`). | Proposta v2.2 sugeria que Jogador 1 escolhesse a cor. | 🏠 Mantida Regra da Casa v2.1 (`activeColor` inicial = `'red'`). |

---

## 🚀 Roteiro de Ordem e Execução Detalhado (Passos 1 ao 8)

### 1. **Passo 1: Tabela de Comportamento Atual & Validação de Regras do Motor [CONCLUÍDO]**
   - **O que foi identificado:** Necessidade de mapear a fundo a lógica de baralho, descarte, penalidades e contagem de pontos no motor autoritativo.
   - **O que foi feito para resolver:**
     - Auditoria completa dos arquivos `server/unoEngine.ts`, `server.ts` e `server/authService.ts`.
     - Confirmação do funcionamento do baralho de 108 cartas, regras de pontuação de vitória (soma das mãos dos perdedores) e reciclagem do descarte.

### 2. **Passo 2: Envelope Versionado, Idempotência & Exigência do ReconnectToken [CONCLUÍDO]**
   - **O que foi identificado:** Risco de usurpação de `playerId` em reconexões simples e ausência de garantia contra reprocessamento de mensagens duplicadas por latência de rede.
   - **O que foi feito para resolver:**
     - Implementação de envelope WebSocket com `protocolVersion: 2` e `messageId`.
     - Criação do `processedMessageCache` com janela de retenção de 60 segundos para responder a `messageId` idênticos sem re-executar ações no servidor.
     - Associação estrita de `socketId` com `playerId`.
     - Exigência do token secreto `reconnectToken` (gerado e salvo em `sessionStorage`) no comando `sync_session`. Rejeição com erro `NOT_AUTHENTICATED` se o token estiver ausente ou inválido.

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
     - Suporte autoritativo à **Proteção Infantil (`autoUnoProtection`)**, onde o servidor realiza o grito de UNO automaticamente para crianças pequenas quando ativado pelo Anfitrião (`host`).

### 5. **Passo 5: Persistência Atômica com `fsync`, Sanitização WebRTC & Higienização Unicode [CONCLUÍDO]**
   - **O que foi identificado:** Risco de corrupção de arquivos JSON (`users.json`, `invites.json`, `stats.json`) em caso de desligamento abrupto e possibilidade de personificação em mensagens de voz WebRTC.
   - **O que foi feito para resolver:**
     - Implementação da função `atomicWriteFileSync` usando `openSync` + `writeSync` + `fsyncSync` + `renameSync` no disco rígido para garantir gravação física atômica.
     - Sanitização do campo `fromPlayerId` em sinais WebRTC (`rtc_offer`, `rtc_answer`, `rtc_ice_candidate`), sempre sobrescrevendo pelo ID autenticado do socket.
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
     - Criação do arquivo `tests/unoEngine.test.ts` com **24 testes unitários automatizados** cobrindo a composição do baralho (108 cartas), regras de jogabilidade (`isCardPlayable`), navegação de turnos, efeito de Reverse com 2 e 3+ jogadores, regra de primeira carta virada, vitória com `draw2`/`wild4`, exigência de compra prévia em `pass_turn`, janela de vulnerabilidade do UNO com Skip e +2, expiração do temporizador de turno (`handleTimeoutEngine`), acusação (`catch_uno`), bloqueio de auto-multa (`UNO_SELF_CATCH`), reciclagem do descarte e cálculo de pontuação.
     - Execução da suíte com 100% de aprovação (`24 passed`).

### 8. **Passo 8: Homologação Final de Build, Linter e Documentação Sincronizada [CONCLUÍDO]**
   - **O que foi feito para resolver:**
     - Execução do Linter TypeScript (`lint_applet`): `0 erros`.
     - Execução do Compilador Vite/React (`compile_applet`): Build aprovado com sucesso.
     - Atualização integrada e completa de todos os manuais e especificações do repositório (`GAME_MANUAL.md`, `SYSTEM_SPECIFICATION.md`, `USE_CASES.md`, `Game_changes.MD`).

### 9. **Passo 9: Endurecimento de Segurança, Criptografia e Testes de Integração WebSocket [CONCLUÍDO]**
   - **O que foi feito para resolver:**
     - **Remoção de Usurpação de Socket:** Eliminado o fallback que permitia associar sockets não autenticados a `playerId`s ativos. Sockets agora só são vinculados via `join_room`, `start_solo` ou `reconnect_session` com token válido.
     - **Remoção de PINs Hardcoded:** Os PINs `774007` e `1234` foram totalmente removidos. O acesso administrativo exige obrigatoriamente a variável de ambiente `process.env.ADMIN_PIN`.
     - **Fortalecimento de Tokens:** Tokens de reconexão agora utilizam `crypto.randomUUID()` nativo para entropia criptográfica sólida.
     - **Regra de UNO na Compra:** A oportunidade de acusar UNO encerra-se imediatamente quando o próximo jogador efetua a compra de carta (`draw_card`).
     - **Suíte de Testes de Integração WebSocket:** Criação do arquivo `tests/serverIntegration.test.ts` com 5 testes automatizados de protocolo real via WebSocket (totalizando **29 testes automatizados** no projeto: 24 unitários + 5 de integração).

---

## ⚠️ Divergências Conhecidas & Pendências Pós-Deploy

Estas pendências foram mapeadas e registradas. Nenhuma delas impede o deploy da v2.2, servindo como roteiro de melhorias para a v2.3:

1. **Jogador caído na sua vez sem limite de tempo (`turnTimeLimit = 0`):**
   - *Situação:* Se o tempo de turno for ilimitado e o jogador desconectar, o jogo aguarda sua reconexão.
   - *Contornador Atual:* O Host possui o botão **`[ Expulsar ]`** que remove o jogador caído e avança o turno automaticamente (`advanceTurn`).
   - *Pendência v2.3:* Adicionar conversão automática para Bot ou passar a vez automaticamente após 45s mesmo com timer desativado.

2. **Rate Limit para Chat e Sinalização WebRTC:**
   - *Pendência v2.3:* Adicionar limiter de pacotes por segundo para mensagens de texto e áudio para prevenir spam em redes instáveis.

3. **Servidor TURN para Voz WebRTC em Redes 4G Restritas:**
   - *Situação:* A voz atualmente utiliza STUN público. Caso dois celulares estejam sob NAT simétrico em rede 4G, a conexão de voz pode falhar.
   - *Pendência v2.3:* Configurar servidor Coturn/TURN dedicado se falhas de áudio forem reportadas em 4G.

4. **Permissões de Disco (`chmod 700`):**
   - *Pendência v2.3:* Configurar permissão restrita `700` na pasta `data/` e backups via script no servidor Linux do deploy.
