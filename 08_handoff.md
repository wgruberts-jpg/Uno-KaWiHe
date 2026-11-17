# 08 — Protocolo de passagem entre Agentes

Objetivo: qualquer Agente assume o projeto lendo os arquivos na raiz, trabalha, e deixa tudo registrado para o próximo.

## Bloco HANDOFF
```
HANDOFF
tarefa: <o que foi pedido>
feito: <lista curta>
arquivos alterados: <caminhos>
regras alteradas/criadas: <IDs>
testes: <rodados? passaram/falharam, quantos>
divergências encontradas: <código x documentação>
regra AI Studio Free Tier: <respeitada?>
próximo passo sugerido: <1 item>
```

## Regras
- Respeito absoluto ao ambiente AI Studio e uso gratuito (Free Tier).
- Nunca introduzir dependências ou serviços pagos.

## Último registro
```
HANDOFF
tarefa: criar script automatizado de teste e simulação completa de torneios (Individual e Duplas 2v2) preservando capacity-test intacto
feito:
  - Criação de scripts/tournament-test.mjs (suporta Individual e Duplas 2v2, Md1/Md3/Md5, desempates automáticos, espectadores TV e telemetria da VM)
  - Provisionamento e autenticação dinâmica de contas de teste JWT via API administrativa (/api/admin/users/create e /api/auth/login)
  - Conexões e ações simultâneas em tempo real via WebSocket (play_card, draw_card, call_uno)
  - Execução segura contra servidor remoto ou local (inclusive via curl pipe), com limpeza automática de contas de teste
  - Adicionado script "tournament-test" no package.json e documentado no manualSH.md
arquivos alterados: scripts/tournament-test.mjs, package.json, manualSH.md, 04_status.md, 08_handoff.md
regras alteradas/criadas: nenhuma alterada; integração total com regras de torneio existentes
testes: executado node scripts/tournament-test.mjs --help com sucesso; validação de lint e tipos limpa
divergências encontradas: nenhuma
regra AI Studio Free Tier: respeitada (100% gratuito/local, sem dependências externas pagas)
próximo passo sugerido: executar simulação de torneio na VM de testes para validação de carga operacional
```

