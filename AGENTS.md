# 🧠 BRIEFING DE TRANSFERÊNCIA PARA AGENTES

## 1. Objetivo
Este documento visa fornecer ao próximo Agente o contexto mínimo necessário para assumir o desenvolvimento do projeto **Uno KaWiHe** sem fricção, garantindo a continuidade das implementações e a integridade do sistema.

## 2. Regras de Ouro para o Agente
Como este projeto é um ambiente de jogo real-time, Agentes devem seguir rigorosamente estas diretrizes:

1. **🔒 REGRA INQUEBRÁVEL — AI STUDIO & USO 100% GRATUITO (FREE TIER):**
   - Respeite estritamente o ambiente suportado pelo AI Studio. **NADA PAGO** pode ser implantado, sugerido ou configurado.
   - É terminantemente proibido introduzir dependências, serviços externos pagos, bancos de dados corporativos pagos (como Oracle Cloud pago, RDS cobrado, etc.) ou APIs cobradas.
   - Utilize sempre recursos nativos, locais, self-hosted ou planos gratuitos (ex: persistência atômica em arquivos JSON locais, WebSockets integrados no Node.js e WebRTC P2P para voz).
   - Na dúvida se algo requer pagamento ou suporte no AI Studio, adote a alternativa gratuita local ou pergunte.
2. **O Servidor é a Única Autoridade:** O cliente apenas envia intenções. Toda validação (regras de UNO, identidade, contagem de cartas, penalidades) ocorre estritamente no `server.ts` e `server/unoEngine.ts`.
2. **Segurança em Primeiro Lugar:**
   - Nunca hardcode segredos.
   - Use apenas as rotas de autenticação via JWT.
   - Scripts de manutenção (na pasta `/scripts/`) devem ser executados com cautela e em ambiente seguro.
3. **Contrato Funcional:** Antes de qualquer alteração, consulte `/Game_funcionalidades`. Se o comportamento real do código divergir deste contrato, priorize a correção do código e, posteriormente, a atualização do contrato.
4. **Validar antes de Confirmar:**
   - Sempre execute `npm test` antes de assumir que o sistema está saudável.
   - Se uma tarefa resultar em mudanças estruturais, execute `npx tsc --noEmit` e `npm run build` para garantir a integridade.

## 3. Estado Atual do Sistema
- **Status:** Operacional.
- **Protocolo de Comunicação:** WebSocket com envelope versionado (`protocolVersion: 2`).
- **Persistência:** Arquivos JSON atômicos em `/data/` com sincronização `fsync`.
- **Destaques Recentes:** 
  - Correção de dupla sala ao iniciar treino.
  - Implementação de proteção contra clique duplo.
  - Guia de liberação de microfone para Firefox e Chrome via HTTP/IP.
  - Painel de diagnóstico e moderação administrativa.

## 4. Estrutura de Documentação (Para referência rápida)
- `/Game_funcionalidades`: Contrato normativo do jogo.
- `/SYSTEM_SPECIFICATION.md`: Arquitetura técnica.
- `/manualSH.md`: Guia de scripts de automação.
- `/USE_CASES.md`: Mapeamento de fluxos e regras de segurança.

## 5. Protocolo de Ação do Agente
Ao assumir a próxima tarefa, o Agente deve:
1. **Auditoria:** Ler o `.md` correspondente à tarefa ou o `Game_funcionalidades`.
2. **Verificação:** Executar os testes (`npm test`) para garantir a linha de base.
3. **Implementação:** Seguir os padrões de TypeScript do projeto.
4. **Verificação de Regressão:** Executar os testes novamente.
5. **Atualização:** Se a tarefa alterou regras de negócio, atualizar o `Game_funcionalidades` e outros arquivos `.md` pertinentes.

---
*Este documento é a fonte da verdade para qualquer Agente que assuma este ambiente.*
