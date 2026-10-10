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

## Admin e Segurança
- **REG-ADM-01** Rotas `/api/admin/*` exigem JWT com `role === 'admin'`.
- **REG-SEG-01** `JWT_SECRET` obrigatório; senhas com bcrypt. Nenhuma cobrança ou dependência paga.
