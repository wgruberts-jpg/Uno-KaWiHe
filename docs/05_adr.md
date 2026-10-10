# 05 — Decisões (ADR curto)

## ADR-001 · v2.1 · Servidor autoritativo
Motivo: impedir trapaça e vazamento de cartas. Consequência: cliente só envia intenções; mãos vão por `hand_state`.

## ADR-002 · v2.2 · `reconnectToken` separado do `playerId`
Motivo: `playerId` é público; usá-lo como segredo permitiria usurpação. Consequência: token gerado por sala, enviado só no `room_joined`.

## ADR-003 · v2.2 · Persistência em JSON local com escrita atômica (AI Studio Free Tier)
Motivo: simplicidade operacional, zero custo, sem necessidade de banco de dados pago externo. Consequência: temp → fsync → rename.

## ADR-004 · v2.2 · Voz em malha P2P sem servidor de mídia pago
Motivo: custo zero e simplicidade. Consequência: WebRTC direto entre navegadores.

## ADR-005 · v2.2 · Regra Inquebrável AI Studio Free Tier
Motivo: garantir que nenhuma dependência ou serviço pago seja introduzido sem validação prévia. Consequência: proibição estrita de serviços cobrados.
