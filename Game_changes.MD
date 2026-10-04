# 📑 GAME_CHANGES.MD — PLANO DE TRANSIÇÃO E EVOLUÇÃO UNO KAWIHE v2.2

Este documento estabelece o roteiro de auditoria, adequação e testes para a transição do sistema **Uno KaWiHe v2.1** para a especificação normativa **Uno KaWiHe v2.2**.

---

## 🎯 Visão Geral da Evolução v2.2

A v2.2 consolida o modelo de **Servidor Autoritativo Estrito**, garantindo que:
1. **Zero Trust no Cliente:** O cliente apenas envia intenções (ex: `{ type: 'play_card', cardId }`). O servidor é a única autoridade sobre turnos, validade de cartas, estado das mãos, baralho e pontuação.
2. **Separação de Estado Público x Privado:** O `GameState` transmitido para a sala não contém a lista de cartas da mão de nenhum jogador. Cada jogador recebe suas cartas exclusivamente via `HandState` individual em seu próprio WebSocket.
3. **Identidade Vinculada ao Socket:** Prevenção de usurpação de ações (`PLAYER_MISMATCH`).
4. **Reconexão Resiliente:** Uso de `reconnectToken` secreto para restauração instantânea da partida caso o Wi-Fi do jogador oscile.
5. **Idempotência & Versionamento:** Envelope de mensagem com `protocolVersion: 2` e `messageId` para evitar cliques duplos ou ações duplicadas na rede.
6. **Persistência Atômica:** Salvamento em disco seguro por gravação temporária e substituição atômica (`rename`).

---

## 📊 Matriz de Conformidade e Auditoria do Código Existente

| Funcionalidade / Regra | Especificação v2.2 | Estado Atual no Código | Ação Necessária |
| :--- | :--- | :--- | :--- |
| **Autoridade do Servidor** | 100% Autoritativo | Parcialmente em `unoEngine.ts` | Reforçar no WebSocket para ignorar dados arbitrários enviados do cliente |
| **Estado Público x Privado** | `GameState` (público) / `HandState` (privado) | Cartas enviadas em formato aberto | Separar o envio no broadcast x mensagem direcionada |
| **Cartas Jogáveis (`playableCardIds`)** | Calculadas exclusivamente pelo servidor | Calculadas no cliente e servidor | Servidor envia a lista válida no `HandState` |
| **Identidade do Socket** | Associação `socketId <-> userId/playerId` | Mapeado por `playerId` direto | Implementar verificação `PLAYER_MISMATCH` |
| **Reconexão** | `reconnectToken` secreto | `sync_session` por `playerId` | Gerar e validar `reconnectToken` no `room_joined` |
| **Envelope WebSocket** | `protocolVersion: 2` + `messageId` | Tipos de mensagens diretos | Adicionar suporte a envelopes idempotentes |
| **Baralho & Descarte** | 108 cartas, embaralhamento Fisher-Yates | Implementado em `unoEngine.ts` | Confirmar e preservar regras ativas |
| **Persistência em Disco** | Escrita atômica (temp -> rename) | `fs.writeFileSync` direto | Implementar padrão de substituição atômica segura |

---

## 🚀 Plano de Ação em 5 Passos Modulares

### 📌 Passo 1: Auditoria Inicial & Mapeamento de Comportamento
* Mapear todos os tipos em `src/types/uno.ts`, funções de `server/unoEngine.ts`, `server.ts` e `authService.ts`.
* Confirmar regras vigentes do baralho e pontuação sem alterar funcionalidades existentes.

### 📌 Passo 2: Envelope Versionado & Segurança de Identidade do Socket [CONCLUÍDO]
* ✅ Implementado envelope WebSocket com suporte a `protocolVersion: 2` e `messageId` idempotente.
* ✅ Adicionado cache de idempotência com janela de 60 segundos (`processedMessageCache`) para ignorar duplicados.
* ✅ Implementada validação de identidade do Socket (`ConnectionMeta` com `socketId`, `playerId`, `roomId`, `reconnectToken`).
* ✅ Bloqueada qualquer tentativa de usurpação de ações com erro `PLAYER_MISMATCH`.
* ✅ Geração e envio do `reconnectToken` secreto em cada `room_joined`.

### 📌 Passo 3: Separação de Estado Autoritativo (Público `GameState` x Privado `HandState`)
* Modificar a transmissão de estado do servidor:
  * Broadcast público de `GameState` (sem lista de cartas das mãos dos adversários).
  * Mensagem individual `hand_state` contendo `hand`, `playableCardIds`, `canDraw` e `canPassTurn`.
* Adaptar o frontend (`GameBoard.tsx`) para consumir o `hand_state` sem alterações visuais.

### 📌 Passo 4: Token Secreto de Reconexão & Janela Estrita de UNO
* Gerar `reconnectToken` secreto no `room_joined`.
* Atualizar o `sync_session` para exigir o `reconnectToken` para restaurar o estado após queda do Wi-Fi.
* Garantir o tratamento autoritativo de `call_uno` e `catch_uno` no motor.

### 📌 Passo 5: Persistência Atômica, Sanitização WebRTC & Homologação Final
* Implementar salvamento atômico de arquivos JSON em `server/authService.ts`.
* Aplicar validação estrita nos pacotes de sinalização WebRTC.
* Executar verificação com `lint_applet` e `compile_applet`.
