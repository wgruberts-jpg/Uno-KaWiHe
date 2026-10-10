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
divergências encontradas: <código x docs>
regra AI Studio Free Tier: <respeitada?>
próximo passo sugerido: <1 item>
```

## Regras
- Respeito absoluto ao ambiente AI Studio e uso gratuito (Free Tier).
- Nunca introduzir dependências ou serviços pagos.
