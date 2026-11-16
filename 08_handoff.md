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
tarefa: atualizar AGENTS.md e toda a documentação e arquivos de planejamento do projeto
feito: alinhamento de AGENTS.md, 01-08, README.md, SYSTEM_SPECIFICATION.md, USE_CASES.md, GAME_MANUAL.md, Game_changes.MD, Game_funcionalidades e manualSH.md para v2.2.3 (Torneios, Modo 2v2, esquemas JSON em data/, Monitor VM e 91 testes)
arquivos alterados: AGENTS.md, 01_casos_de_uso.md, 02_regras.md, 03_arquitetura.md, 04_status.md, 05_adr.md, 06_testes.md, 07_historico.md, 08_handoff.md, README.md, SYSTEM_SPECIFICATION.md, USE_CASES.md, GAME_MANUAL.md, Game_changes.MD, Game_funcionalidades, manualSH.md
regras alteradas/criadas: REG-TOR-01 a REG-TOR-06, ADR-006, ADR-007
testes: rodados (npm test) — 91/91 passaram em 5 suítes
divergências encontradas: docs antigos citavam v2.2 e 38/42 testes; código real está na v2.2.3 com 91 testes, sistema de torneios, modo 2v2 e persistência data/tournaments.json
regra AI Studio Free Tier: respeitada (100% gratuito/local)
próximo passo sugerido: manter o ciclo de testes antes de iniciar novos itens do backlog v2.3 em 04_status.md
```
