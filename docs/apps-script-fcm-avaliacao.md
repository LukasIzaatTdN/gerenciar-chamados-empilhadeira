# Pátio Pro Log — avaliação do Google Apps Script para FCM (não implantado)

## Evidências observadas no teste manual (2026-10-19)

- Apps Script criado em conta Gmail pessoal, com projeto GCP **padrão** (não vinculado ao projeto Firebase).
- Manifesto de teste declara `firebase.messaging` e `script.external_request`.
- `ScriptApp.getOAuthToken()` retornou um token não vazio (não registrado em log).
- `POST https://fcm.googleapis.com/v1/projects/painel-772bf/messages:send` com `validate_only:true` e `message:{}` retornou **HTTP 400 INVALID_ARGUMENT: Recipient of the message is not set**.
- Nenhuma mensagem real foi enviada, nenhuma implantação ocorreu e nenhuma alteração IAM foi autorizada.
- **HTTP 400 não prova por si só todas as permissões de produção**, tampouco valida Firestore, autenticação de usuário, limites ou execução como proprietário.

## Requisitos obrigatórios antes de qualquer doPost / implantação

1. Verificar Firebase ID token recebido no corpo da requisição **com verificação criptográfica confiável ou API oficial de validação**. Apps Script web app não deve confiar em `uid`, `empresa_id`, `supermercado_id`, perfil ou evento enviados pelo cliente. Não usar Firebase API key como segredo.
2. Obter do Firestore os dados canônicos de auditoria, chamado, usuário e tokens FCM. Aplicar exatamente as mesmas verificações de autorização/isolamento multiempresa do `push-worker/src/index.js`.
3. Preservar claim de evento **atômico e durável** antes do FCM. Usar criação condicional do documento no Firestore; `LockService` isoladamente não garante idempotência entre processos/sistemas.
4. Persistir estado `claimed`, `sent`, `partial`, classificação `accepted/rejected/unknown` e recuperação uma única vez somente dos destinatários confirmadamente rejeitados. Nunca reenviar automaticamente quando resultado for incerto.
5. Apps Script implantado **executando como proprietário** torna chamadas à API Google privilegiadas. Tratar qualquer URL pública como entrada hostil; não expor `ScriptApp.getOAuthToken()`, não registrar tokens, nem permitir envio por ID/token arbitrário.
6. Investigar limites do Apps Script (execuções simultâneas, tempo máximo, UrlFetch, cota diária) e o comportamento do web app com chamadas do navegador (CORS, preflight, autenticação, redirecionamentos) e do Android. Não assumir equivalência com Cloudflare Worker.
7. Evitar adicionar escopos IAM amplos à conta Gmail pessoal sem revisão; separar permissões quando viável. Validar necessidade de projeto GCP padrão vs. padrão do Firebase, sem alterar OAuth existente em produção.
8. Testes de integração com emuladores/mocks para requisições maliciosas, empresas distintas, duplicidade, concorrência, falhas de rede e limites; teste real somente após revisão e consentimento.

## Próximo experimento seguro

**Somente leitura, sem envio FCM:** testar autorização Firestore REST em recurso deliberadamente inexistente usando o token do Apps Script, para distinguir `404` de `401/403`. Antes, verificar que o manifesto solicita `https://www.googleapis.com/auth/datastore` e `script.external_request`; essa mudança solicitará consentimento OAuth adicional. Nunca exibir token ou conteúdo de documentos. Não alterar IAM nem vincular projetos automaticamente.

Se acesso ao Firestore não estiver disponível, interromper e revisar permissões mínimas antes de qualquer integração. A decisão de usar Apps Script em produção permanece **pendente**.


## Etapa 6.5 — Contrato HMAC preparado (ainda sem implantação)

- `push-worker/src/gateway-hmac.js`: assinatura HMAC-SHA256 com versão, timestamp em milissegundos, nonce UUID v4, payload JSON serializado e assinatura hexadecimal. Não está conectado à rota pública.
- `apps-script-fcm/gateway-verifier.gs`: verificador Apps Script sem `doPost`, sem envio FCM e sem gravação Firestore. O segredo é lido de `PropertiesService` somente quando a função é chamada; não configurar nem executar até revisão.
- `push-worker/tests/gateway-hmac.test.js`: quatro testes locais do contrato com verificador Node independente (alterações, repetição e janela de 5 minutos). **Não substituem testes reais no runtime Apps Script**.
- A verificação do nonce exige `claimNonce` atômico e persistente; a função rejeita por padrão quando ele não existe. `LockService`/memória isoladamente não substituem claim durável entre serviços.
- HMAC autentica o Worker para o Apps Script, **não** autentica o usuário final nem comprova que o evento/empresa/destinatário está autorizado. Antes de habilitar o transporte, preservar validação Firebase e verificações canônicas no Firestore.
- O Worker atual ainda requer Google OAuth diretamente para consultas; portanto, a arquitetura de duas camadas **ainda não está funcional**. Precisamos mover cuidadosamente todas as operações privilegiadas ao backend Google ou validar uma outra fonte de identidade.
- Não conectar `doPost`, não definir segredo, não adicionar IAM e não implantar até aprovação de threat model, teste de concorrência e verificação de quotas.


## Etapa 6.6 — Reserva durável de nonce (protótipo, sem deploy)

- `apps-script-fcm/gateway-nonce-claim.gs` reserva um UUID v4 na coleção `push_gateway_nonces` por meio de Firestore REST `POST .../documents/push_gateway_nonces?documentId=<nonce>`.
- O primeiro create (HTTP 200/201) permite seguir; `409` é repetição e retorna `false`; outros códigos ou falhas de rede interrompem a operação. A reserva precisa ocorrer **depois** da validação HMAC e **antes** de qualquer ação privilegiada.
- `push-worker/tests/gateway-nonce-claim.test.js` simula Apps Script via VM e Firestore mock, incluindo duplicação, falhas e assinatura interoperável. **Os testes foram adicionados, mas precisam ser executados pelo usuário.**
- Cada tentativa assinada gera nonce único, mas isso **não substitui** a idempotência por evento de chamado (`push_delivery_events`) nem a validação de empresa e auditoria. Em caso de falha após reserva, não reprocessar automaticamente sem reconciliação.
- Atenção: coleção `push_gateway_nonces` acumulará documentos. Não habilitar em produção sem política de retenção/limpeza compatível com Spark, quotas e revisão de custo. TTL automático não foi configurado.
- Os arquivos são isolados: não há `doPost`, integração com rota pública, segredo configurado, envio FCM, nem gravação real executada.


## Etapa 6.7 — Identidade por evento de chamado (somente contrato e testes)

- `push-worker/src/call-event-identity.js`: função pura de identificação de eventos por SHA-256 de `empresa + unidade + chamado + ação + ID da auditoria`; suporta `chamado_criado`, `chamado_atualizado`, `chamado_assumido`, `chamado_iniciado`, `chamado_finalizado`.
- `push-worker/tests/call-event-identity.test.js`: seis testes novos para identidade estável, atualizações distintas, isolamento de escopo e rejeição de dados inválidos. **Pendente execução local**.
- **Não integrar à rota de envio ainda.** O Worker existente usa `stableEventKey(action, call)` com timestamps de estado, não aceita `chamado_atualizado` e tem testes de recuperação ligados à chave legada. Migrar sem plano pode permitir reenvio de eventos antigos ou quebrar reconciliação.
- Para ativar atualizações genéricas, primeiro localizar a geração real de `auditoria` no Web e Android e verificar se existe um registro imutável para **cada** atualização, com ator, empresa, unidade, chamado e tipo. Não fabricar eventos a partir de campos do cliente.
- A identidade calculada **não é autorização**: somente após validação da auditoria canônica, do usuário autenticado e da empresa/unidade ela poderá ser usada para `push_delivery_events` com create atômico.
- A arquitetura Worker → Apps Script continua experimental, sem `doPost`, sem segredo compartilhado configurado e sem deploy. Nenhuma notificação foi enviada.


## Etapa 6.8 — Levantamento real do fluxo Web e primeira integração (somente branch de desenvolvimento)

**Constatações do código Web:**
- `src/hooks/useChamados.ts` já cria registros `auditoria` no mesmo `writeBatch` de `chamado_criado`, `chamado_assumido`, `chamado_iniciado` e `chamado_finalizado`; os callbacks recebem o ID da auditoria.
- `src/App.tsx` chama `requestPushDelivery(auditId)` para esses quatro eventos. `src/services/pushNotifications.ts` envia o Firebase ID token do usuário à rota `/api/notify` quando há Worker configurado.
- Antes desta etapa, `atualizarItensTelevendas` fazia apenas `updateDoc`, sem registro de auditoria e sem callback. `marcarACaminho` e `marcarChegada` também usam `updateDoc` sem auditoria. Outros fluxos de atualização e Android precisam ser inventariados separadamente.
- `firestore.rules` e `push-worker/src/index.js` não aceitavam `chamado_atualizado`; a interface também não tinha esse tipo de notificação.

**Alterações preparadas, não publicadas:**
- `atualizarItensTelevendas` agora escreve alteração e auditoria `chamado_atualizado` no mesmo batch, com escopo da empresa/unidade, ator e dados mínimos do evento. Callback `onAtualizado` é disparado após commit.
- `firestore.rules` permite criar auditoria com ação `chamado_atualizado`, mantendo as demais validações existentes; **regras não foram publicadas**. É necessário testar no Firebase Emulator as regras e o batch antes de qualquer deploy.
- `src/types/notification.ts` e `src/App.tsx` passam a reconhecer e exibir a notificação **local/foreground** da atualização. **Não há chamada `requestPushDelivery` para `chamado_atualizado`**: o Worker ainda rejeita essa ação; não afirmar push em segundo plano.
- O backend continua com `stableEventKey` legado e OAuth não resolvido; a chave de auditoria da etapa 6.7 ainda não está ligada ao Worker.

**Pendências críticas antes de habilitar push para atualizações:**
1. Revisar a segurança das regras de auditoria: validar a vinculação atômica entre o evento e a alteração canônica (inclusive concorrência, estado e ator). O registro de auditoria é produzido pelo cliente e não deve ser aceito cegamente pelo backend.
2. Confirmar que cada alteração relevante (inclusive deslocamento/chegada, se desejado) gera evento apropriado e que alterações Android seguem o mesmo contrato.
3. Criar testes do Firebase Emulator para batch + isolamento entre empresas, e testes de UI/build; testes `push-worker` isolados não validam essas mudanças.
4. Definir estratégia de envio quando o cliente que atualiza fica offline/fecha antes de requisitar push; Firebase Spark não oferece trigger Cloud Functions gratuito.
5. Avaliar quotas, retenção de `push_gateway_nonces`, Apps Script e Firestore antes de ativação.

**Segurança operacional:** nenhuma publicação, deploy, IAM, cobrança, segredo ou escrita de produção nesta etapa.


## Etapa 6.9 — Testes específicos de atualização de chamados (pendentes de execução)

Criado `functions/tests/firestore/chamados-update.rules.test.mjs` e incluído no comando `npm run test:rules`. São sete testes novos no Firestore Emulator: atualização + auditoria no mesmo batch; operador de outra empresa sem acesso; tentativa de forjar escopo; rollback do batch com auditoria inválida; operador inativo; imutabilidade da auditoria; e caracterização explícita de falha de autenticidade.

**Lacuna de segurança conhecida e bloqueadora de produção:** as regras atuais permitem que um operador ativo da própria empresa crie uma auditoria `chamado_atualizado` isoladamente, sem alterar o chamado. O teste `KNOWN GAP` documenta que a operação **atualmente é aceita**; passar nesse teste NÃO demonstra segurança. Antes de ativar o push é obrigatório endurecer as regras e exigir vínculo atômico e verificável entre evento e alteração canônica, inclusive impedir falsificação de detalhes. O Worker também precisa conferir a auditoria e o estado persistido.

Os sete testes são novos e **não foram executados pelo assistente**. Resultado esperado: 18 testes de regras (11 existentes + 7 novos), se todos passarem; além dos 19 testes Web e build já relatados na etapa anterior. Nenhum deploy ou publicação de regras.


## Etapa 6.10 — Vinculação atômica de auditoria de atualização (em validação)

Alterações exclusivamente na branch de desenvolvimento:
- O cliente Web grava `ultima_auditoria_atualizacao_id` no chamado, no mesmo batch da atualização e do novo registro de `auditoria`.
- Para `chamado_atualizado`, a regra de criação de auditoria consulta `get()` (estado anterior) e `getAfter()` (estado resultante do commit) do chamado. Confere escopo de empresa/unidade, tipo Televendas, ID novo, estado anterior e posterior, operador, horário de atualização e pelo menos uma mudança real nos dados de negócio.
- O teste `KNOWN GAP` agora exige rejeição de auditoria isolada. Testes adicionais cobrem divergência de status, atualização apenas do marcador e reutilização do mesmo ID.

**Limitação e condição para avançar:** esta alteração não foi executada pelo assistente no Emulator. Validar `npm run test:rules`, `npm test` e `npm run build` antes de considerar o resultado aprovado. O Firestore Emulator pode rejeitar expressões muito complexas; investigar se houver `maximum of 1000 expressions`. A regra atual impede a criação isolada de auditoria, mas ainda não obriga que *toda* atualização de chamado gere auditoria: esse contrato deve ser analisado separadamente. A conferência de autenticidade no Worker e as alterações Android ainda estão pendentes. **Nenhum deploy nem escrita em produção.**


## Etapa 6.10.1 — Testes de regressão e lacuna residual (aguardando execução)

Acrescentados cinco testes ao arquivo `functions/tests/firestore/chamados-update.rules.test.mjs`: controle positivo de novo lote válido, tentativa de lote completo por empresa estrangeira, tentativa de alteração de identificadores/escopo, auditoria isolada com ID diferente do marcador e caracterização de atualização do marcador sem documento de auditoria.

**KNOWN GAP:** a regra de atualização de `chamados` ainda aceita que um operador autorizado atualize `ultima_auditoria_atualizacao_id` sem criar `auditoria/{id}` no mesmo commit. O teste documenta esse comportamento esperado atualmente e **não** comprova sua segurança. Não habilitar notificações push de `chamado_atualizado` enquanto a integridade bidirecional não for exigida e comprovada. Além disso, alguns testes negativos continuam exibindo `maximum of 1000 expressions`; aprovação isolada de `assertFails` não comprova a razão correta da rejeição.

Validação pendente no Firebase Emulator: `npm run test:rules` (esperados 26 testes), `npm test`, `npm run build`. Sem deploy, sem publicação de regras e sem produção.


## Etapa 6.10.2 — Vinculação bidirecional de auditoria (não validada)

Commit de regras: `bfc3406`. A atualização do chamado Televendas com marcador agora requer que `auditoria/{ultima_auditoria_atualizacao_id}` não exista antes e exista após a mesma operação atômica, com ação, chamado, ator, escopo, status anterior/atual e horário compatíveis. O caminho legado de atualização verifica primeiro se o marcador não foi alterado, evitando avaliar o validador custoso para essas tentativas.

Commit de testes: `13e46c2`. O antigo teste de caracterização `KNOWN GAP` passou a exigir `assertFails` e ausência de alteração no chamado; adicionado teste de auditoria com entidade divergente. Esperados **27 testes** de regras.

**Ainda não testado no Emulator.** A nova verificação `existsAfter/getAfter` pode ultrapassar o orçamento de expressões em commits válidos. Não interpretar a aprovação de testes negativos com mensagens de `maximum of 1000 expressions` como validação de isolamento. Executar `npm run test:rules`, `npm test` e `npm run build` localmente. Não publicar regras, não habilitar push, não alterar produção.


## Etapa 6.10.3 — Redução de avaliações e controles de isolamento (aguardando Emulator)

Ajustado o caminho dedicado de atualização auditada de Televendas para rejeitar diferenças de identidade/campos antes das leituras de usuário e validar o perfil ativo e o vínculo empresa/unidade diretamente a partir de `usuarios/{uid}`. O caminho legado agora testa escopo antes do validador geral de chamado, evitando avaliação desnecessária para outras empresas. Alterações apenas na branch de desenvolvimento, sem deploy.

Adicionados controles: atualização **válida** da empresa B com auditoria atômica, e tentativa **inválida** de lote completo por operador inativo. A suíte de regras deve ter **29 testes**.

**Pontos de atenção:** a mudança de ordem pode alterar comportamentos de perfis com documentos antigos/incompletos. Validar positivos e negativos no Emulator. Os erros `maximum of 1000 expressions` e `evaluation error` em testes negativos ainda precisam ser observados: um `assertFails` que passa devido ao orçamento de regras **não** comprova que a validação de segurança foi aplicada. Executar `npm run test:rules`, `npm test`, `npm run build`; enviar os logs completos antes de considerar a etapa aprovada. Não publicar regras, não habilitar push.


## Etapa 6.10.4 — Diagnóstico do orçamento de expressões (aguardando testes)

No Emulator da 6.10.3, 29/29 testes de regras, 19/19 JavaScript e build passaram, porém vários testes negativos tiveram `maximum of 1000 expressions` na regra de atualização de chamados. O operador ternário na regra `allow update` agora separa **antes** da avaliação as escritas que alteram `ultima_auditoria_atualizacao_id` das escritas legadas. Isso impede que o fallback legado seja avaliado após falha da validação auditada. Adicionados dois testes de regressão (31 testes de regras esperados).

**Critério de aceite:** os testes negativos do fluxo auditado devem rejeitar sem erro de orçamento na linha de `chamados` e os positivos devem continuar passando. Erros de avaliação em outras coleções (SaaS, usuários e auditoria) devem ser investigados separadamente, não escondidos. Testes `assertFails` não verificam motivo do erro; conferir log do Emulator e, se necessário, a cobertura de regras.

Executar `npm run test:rules 2>&1 | tee /tmp/patio-rules-6104.log`, `npm test` e `npm run build`. Não publicar regras, não habilitar push, não modificar `main` ou produção.


## Etapa 6.10.5 — Guarda de auditoria e prioridade da atualização própria (aguardando Emulator)

Diagnóstico da 6.10.4: 31/31 testes de regras, 19/19 unitários e build aprovados; o erro de orçamento de 1.000 expressões deixou de aparecer em `chamados`, mas ainda ocorreu em `usuarios` e houve `evaluation error` em `chamados` e `auditoria`.

A regra `usuarios/{id}` agora avalia primeiro a alternativa de atualização do próprio perfil, mantendo as duas alternativas administrativas. Isso visa evitar avaliação dispendiosa de privilégios administrativos para uma atualização própria legítima. Na auditoria de Televendas, o identificador do chamado é verificado como string não vazia e `details` como mapa antes da construção/leitura do caminho `chamados/{entityId}`. Dois testes negativos de identificador de entidade ausente/não textual foram adicionados (**33 testes de regras previstos**).

**Importante:** a mudança não garante por si só a eliminação de `evaluation error`, que pode continuar em casos de documento inexistente ou campos ausentes. O teste `assertFails` não distingue rejeição esperada de erro interno. Inspecionar as mensagens de `evaluation error` e de limite de 1.000 expressões nos logs; testar também os fluxos administrativos existentes. Não publicar regras até confirmação dos resultados.

Comandos: `git pull --ff-only origin fix/push-worker-security-reliability`, `npm run test:rules 2>&1 | tee /tmp/patio-rules-6105.log`, `npm test`, `npm run build`. Sem deploy, push ativo, alterações em produção ou custos pagos.


## Etapa 6.10.6 — Validação pendente

Regras alteradas na branch de desenvolvimento: pré-validação de campos obrigatórios de auditoria de Televendas, isolamento da alternativa genérica para ações diferentes de `chamado_atualizado`, e filtros baratos antes dos caminhos administrativos de atualização de usuários. A implementação não foi validada no Emulator. Executar `npm run test:rules 2>&1 | tee /tmp/patio-rules-6106.log`, `npm test` e `npm run build`; inspecionar erros `evaluation error` e `maximum of 1000 expressions`, sobretudo em chamadas, auditoria e usuários. Não publicar regras ou habilitar push.


## Etapa 6.10.7 — Cobertura diagnóstica das regras (sem deploy)

Criado `scripts/firebase/diagnose-firestore-rules.mjs` e comando `npm run test:rules:diagnose`. O comando executa os três arquivos de testes dentro do Firestore Emulator e, **antes de o Emulator encerrar**, salva:
- `/tmp/patio-rules-6107.log` — saída completa dos testes;
- `/tmp/patio-rules-6107-summary.json` — código de saída, contagens de `evaluation error` e `maximum of 1000 expressions`, com agrupamento por linha e operação;
- `/tmp/patio-rules-6107-coverage.html` e `/tmp/patio-rules-6107-coverage.json` — relatórios do endpoint oficial de cobertura do Emulator, se disponíveis.

Adicionados dois testes de auditoria malformada (detalhes ausentes/incompletos), total esperado de **35 testes de regras**. O diagnóstico **não afirma que rejeições com `assertFails` são rejeições seguras**; os erros continuam sendo contabilizados. Para exigir saída não zero diante de qualquer erro de avaliação: `PATIO_RULES_STRICT=1 npm run test:rules:diagnose` (espera-se que falhe no estado atual, útil como meta futura). O comando padrão só falha se os testes falharem.

Executar `git pull --ff-only origin fix/push-worker-security-reliability`, `npm run test:rules:diagnose`, `npm test`, `npm run build`. Enviar o arquivo `/tmp/patio-rules-6107-summary.json` e, para diagnóstico detalhado, o HTML/JSON de cobertura e log. Sem publicação de regras, sem produção, sem push ativo, sem serviços pagos.


## Etapa 6.10.8 — Diagnóstico de cobertura e isolamento de testes

O diagnóstico 6.10.7 executado localmente passou 35/35 testes de regras e 19/19 testes JS, mas registrou 43 ocorrências de `evaluation error` e 12 ocorrências do limite de 1.000 expressões. O JSON de cobertura retornou HTTP 404 porque o script utilizava o sufixo `.json`, inexistente no endpoint do Emulator. O endereço foi corrigido para `/emulator/v1/projects/demo-patio-pro-log:ruleCoverage`, enquanto o HTML continua usando `:ruleCoverage.html`.

O script agora aceita `PATIO_RULES_FOCUS=chamados` (somente Televendas) ou `PATIO_RULES_FOCUS=assinaturas` (somente SaaS), além do padrão `all`. O relatório inclui o foco e contagem resumida por categoria. Os arquivos gerados usam o prefixo `/tmp/patio-rules-6108` por padrão; para evitar sobrescrita, informe `PATIO_RULES_REPORT_PREFIX` diferente para cada execução.

Comandos recomendados, **somente Emulator**:

```bash
git pull --ff-only origin fix/push-worker-security-reliability
npm run test:rules:diagnose
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-6108-chamados npm run test:rules:diagnose
PATIO_RULES_FOCUS=assinaturas PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-6108-assinaturas npm run test:rules:diagnose
npm test
npm run build
```

Compartilhar os três arquivos `*-summary.json` e o `*-coverage.json` de cada execução. A correção do endpoint e a divisão de testes **não corrigem automaticamente** os erros de segurança: `assertFails` pode aprovar um erro interno. Sem deploy, publicação de regras, escrita em produção ou ativação de push.


## Etapa 6.10.9 — Guardas SaaS para campos e documentos ausentes (aguardando validação)

No ramo `fix/push-worker-security-reliability`, o commit `9591db2` adicionou `keys().hasAll` a validações de plano, histórico, operações e auditoria SaaS; substituiu leituras opcionais de limites de plano por `get("campo", null)`; adicionou `existsAfter` para operações, histórico e auditoria relacionadas antes das verificações; e exigiu `ultima_operacao_id`/`plano_id` antes da validação de assinatura. O commit `d70c070` acrescentou um teste com cinco documentos SaaS malformados. Os testes negativos ainda usam `assertFails`, que pode passar em erros de avaliação; o diagnóstico estrito continua necessário.

Validação **local, sem deploy**:

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-6109 npm run test:rules:diagnose
npm test
npm run build
```

Comparar `/tmp/patio-rules-6109-summary.json` e `/tmp/patio-rules-6109.log` com a base 6.10.8: total de testes de regras esperado **36** (35 anteriores + 1 novo), contagem de erros de avaliação e de limite de 1.000 expressões; conferir que os fluxos SaaS válidos e os testes de isolamento multiempresa seguem aprovados. **Não considerar a etapa concluída até os testes locais e a revisão do log.** Sem publicar regras, sem escrita em produção, sem serviços pagos ou push ativo.


## Etapa 6.10.10 — Diagnóstico por bloco de regras e limite de expressões

Base observada na execução 6.10.9: 36/36 testes de regras aprovados, 43 menções a `evaluation error`, 12 menções ao limite de 1.000 expressões. O relatório anterior categorizava incorretamente os erros porque dependia de números fixos de linhas.

O script `scripts/firebase/diagnose-firestore-rules.mjs` agora identifica as linhas `match` diretamente de `firestore.rules`, categoriza cada ocorrência e acrescenta `budgetByRule` e `budgetByCategory`. O prefixo padrão passou a ser `/tmp/patio-rules-61010`. Esta etapa altera **somente o diagnóstico**, não altera `firestore.rules`; a contagem de erros ainda precisa ser reduzida em correções posteriores, orientadas pelo relatório de cobertura.

Comandos locais, **exclusivamente Firebase Emulator**:

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61010 npm run test:rules:diagnose
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61010-chamados npm run test:rules:diagnose
PATIO_RULES_FOCUS=assinaturas PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61010-assinaturas npm run test:rules:diagnose
npm test
npm run build
```

Compartilhar os arquivos `/tmp/patio-rules-61010-summary.json`, `/tmp/patio-rules-61010-chamados-summary.json`, `/tmp/patio-rules-61010-assinaturas-summary.json` e `/tmp/patio-rules-61010-coverage.json`. Testes `assertFails` aprovados não comprovam negação limpa; conferir `evaluationErrorMentions` e `expressionBudgetMentions`. Nenhum deploy, publicação de regras, alteração em produção, serviço pago ou push real.


## Etapa 6.10.11 — Pré-filtros de auditoria Televendas (aguardando testes)

Base 6.10.10 (Emulator): 43 menções a erros de avaliação e 12 ao limite de 1.000 expressões; foco chamados: 24 erros, 11 estouros, todos estes na criação de auditoria (linha 835); foco assinaturas: 19 erros, 1 estouro em atualização de usuários. Esses valores são **base anterior**, não resultados desta alteração.

Em `firestore.rules`, `isTelevendasUpdateAuditAgainstCall` agora verifica a existência do chamado antes de ler seu estado, exige que o estado pós-commit contenha o marcador de auditoria exato e que o marcador anterior seja diferente, antes de executar as comparações de detalhes. O teste `chamados-update.rules.test.mjs` ganhou cenário para auditoria órfã e replay. O isolamento por empresa/unidade e a obrigatoriedade do commit atômico não foram removidos.

Atenção: `assertFails` também pode aprovar negativas que geraram erros internos. Portanto, comparar **erros de avaliação e limites**, além da aprovação dos testes. `existsAfter` pode aumentar o custo das regras e precisa de validação real no Emulator antes de qualquer nova alteração.

Comandos, sem deploy:

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61011-chamados npm run test:rules:diagnose
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61011 npm run test:rules:diagnose
npm test
npm run build
```

Arquivos para análise: `/tmp/patio-rules-61011-chamados-summary.json`, `/tmp/patio-rules-61011-chamados.log`, `/tmp/patio-rules-61011-summary.json` e `/tmp/patio-rules-61011-coverage.json`. Meta: 25/25 testes no foco chamados, 37/37 no total (antes 24 e 36); erros de avaliação e estouros idealmente menores que 24/11 no foco e 43/12 no total. Caso testes positivos falhem ou o limite aumente, reavaliar/reverter esta alteração antes de prosseguir. Não executar deploy, não publicar regras, não ativar push e não usar serviços pagos.


## Etapa 6.10.11.1 — Reversão controlada e preparação da próxima otimização

Os resultados locais da 6.10.11 foram: 37/37 testes gerais aprovados, 25/25 testes de chamados, **45** menções a erros de avaliação e **14** menções ao limite de 1.000 expressões. No foco chamados: **26** erros e **13** estouros. A linha de criação de auditoria continuou sendo o gargalo. Os dois testes adicionais (auditoria órfã e replay) passaram, mas geraram erros de avaliação; `assertFails` sozinho não prova rejeição limpa.

A alteração experimental da função `isTelevendasUpdateAuditAgainstCall` introduzida no commit `55a2dc4` foi revertida **somente nessa função**. Foram removidas as chamadas adicionais `exists(callPath)` e `existsAfter(callPath)`, e restauradas a ordem e a comparação do marcador anteriores à 6.10.11. Os testes novos e os diagnósticos foram preservados. Não foi utilizado `git revert` do commit inteiro, para não desfazer trabalho não relacionado.

### Plano para a otimização posterior

1. Usar os testes negativos específicos que geram `maximum of 1000 expressions` para avaliar mudanças pequenas e isoladas.
2. Investigar primeiro o custo duplicado entre a regra `allow update` de `chamados` e a regra `allow create` de `auditoria` no mesmo `writeBatch`, sem relaxar a validação de empresa, unidade, usuário, ID do chamado, marcador e dados anteriores/posteriores.
3. Avaliar pré-filtros baratos e leituras de documentos apenas após validação de formato; medir o custo no Emulator a cada mudança.
4. Manter testes positivos para operadores das duas empresas e negativos para alterações sem auditoria, replay, auditoria órfã, identidade adulterada, empresa diferente e usuário inativo.

### Validação local necessária (sem deploy)

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610111-chamados npm run test:rules:diagnose
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610111 npm run test:rules:diagnose
npm test
npm run build
```

Arquivos para comparar: `/tmp/patio-rules-610111-chamados-summary.json`, `/tmp/patio-rules-610111-chamados.log`, `/tmp/patio-rules-610111-summary.json`. Esperado: 25/25 no foco, 37/37 geral, e retorno aproximado à linha de base 6.10.10 (24 erros/11 estouros no foco; 43/12 no geral). Como dois testes novos continuam na suíte, as contagens podem ficar maiores mesmo com a função restaurada. Registrar as diferenças por teste, não somente os totais.

Nenhuma alteração de produção, deploy, publicação de regras, push real, serviço pago ou modificação na branch `main`.


## Etapa 6.10.12 — Escopo do ator da auditoria Televendas

Baseline confirmado após reversão 6.10.11.1: 37/37 testes gerais, 25/25 chamados; 45 menções a erro de avaliação, 14 estouros (26/13 no foco chamados). As duas negativas novas continuam contribuindo para as contagens.

A regra `allow create` especializada para `action == "chamado_atualizado"` passa a usar `isTelevendasAuditActorInScope` para ler o documento do ator uma única vez, validar `status == "Ativo"`, perfil permitido e o vínculo da empresa/unidade. `Administrador Geral` pode operar globalmente; `Administrador da Empresa` apenas na sua empresa; perfis operacionais somente na empresa e unidade correspondentes. A verificação de marcador, chamado antes/depois e detalhes de auditoria continua inalterada. O caminho genérico de outras ações de auditoria não foi modificado.

Dois testes adicionais: autorização positiva de administrador da empresa na própria empresa e negativa de auditoria em outra empresa. A suíte de chamados deverá conter **27** testes; total geral **39**, se todas as suítes anteriores forem preservadas.

### Validação local obrigatória

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61012-chamados npm run test:rules:diagnose
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61012 npm run test:rules:diagnose
npm test
npm run build
```

Enviar `/tmp/patio-rules-61012-chamados-summary.json`, `/tmp/patio-rules-61012-chamados.log` e `/tmp/patio-rules-61012-summary.json`. Avaliar **testExitCode**, testes positivos, rejeições negativas, `evaluationErrorMentions` e `expressionBudgetMentions`. Não assumir melhora sem os relatórios. Se testes positivos falharem ou orçamento piorar, interromper e reverter apenas esta otimização. Nenhum deploy, publicação de regras, push real, cobrança ou mudança em produção.


## Etapa 6.10.13 — Guarda mínima para auditoria órfã

Baseline medido na 6.10.12: 39/39 testes gerais, 27/27 no foco chamados; **46** menções a erro de avaliação, **1** estouro geral de expressões (em `usuarios`), **0** estouros no foco chamados. O log da 6.10.12 ainda mostrou `Null value error` em auditoria órfã.

Experimento controlado: acrescentado **somente** `exists(callPath)` antes da leitura dos campos de `get(callPath).data` / `getAfter(callPath).data` em `isTelevendasUpdateAuditAgainstCall`. Não foram alterados os caminhos de autorização de usuários, assinaturas, tokens ou chamados. Não se acrescentou `existsAfter(callPath)`, para evitar repetir a regressão de custo da 6.10.11. A presença do documento anterior não é garantia de que o documento posterior exista; verificar resultados e logs antes de qualquer mudança adicional.

### Executar apenas no Emulator

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61013-chamados npm run test:rules:diagnose
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61013 npm run test:rules:diagnose
npm test
npm run build
```

Enviar `/tmp/patio-rules-61013-chamados-summary.json`, `/tmp/patio-rules-61013-chamados.log` e `/tmp/patio-rules-61013-summary.json`. Critérios: manter 27/27 e 39/39; manter **0** estouros em chamados; verificar se desapareceu o `Null value error` do teste de auditoria órfã; não aumentar os estouros gerais. Os 46 erros de avaliação gerais não devem ser tratados como meta de zero nesta alteração isolada: muitos correspondem a outros fluxos negativos. Se houver regressão, reverter somente o guard `exists(callPath)`. O único estouro de `usuarios` ficará para investigação separada, com diagnóstico próprio.

Sem deploy, publicação de regras, push real, escrita em produção, alteração de cobrança ou modificação da branch `main`.


## Etapa 6.10.14 — Redução conservadora de avaliações em usuarios

Baseline 6.10.13: `testExitCode=0`, 39/39 testes gerais e 27/27 chamados, 46 menções a erro de avaliação e 1 estouro de 1.000 expressões na regra `usuarios update` (linha 1130 no relatório daquela etapa). O log geral do teste específico que produz esse estouro ainda não foi disponibilizado.

Alteração restrita a `match /usuarios/{id}`, `allow update`: (1) a verificação `isCurrentUserActive()` da autoatualização é feita **depois** das comparações imutáveis e do conjunto de campos alterados; (2) removidas verificações idênticas repetidas de `perfil`, `empresa_id` e `hasOnlyUserManagementChanges` no caminho de gestão do administrador geral. As mesmas condições continuam presentes uma vez. Não foram modificados os caminhos de chamados, auditoria, assinaturas, push tokens ou as funções de autenticação.

### Validação no Emulator — obrigatória antes de aceitar a alteração

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61014 npm run test:rules:diagnose
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-61014-chamados npm run test:rules:diagnose
npm test
npm run build
```

Enviar `/tmp/patio-rules-61014-summary.json`, `/tmp/patio-rules-61014.log`, `/tmp/patio-rules-61014-chamados-summary.json` e, se possível, `/tmp/patio-rules-61014-chamados.log`. Comparar `evaluationErrorMentions`, `expressionBudgetMentions`, `budgetByRule` e resultados de testes. **Critérios:** manter todos os testes positivos e negativos, 39/39 gerais, 27/27 chamados, 0 estouros em chamados, e não aumentar o orçamento de expressões geral. Não afirmar eliminação do último estouro antes de analisar o log geral e o cenário correspondente. Em caso de regressão, reverter apenas a alteração desta etapa.

Nenhum deploy, publicação de regras, escrita em produção, alteração de billing ou `main`.


## Etapa 6.10.14.2 — Diagnóstico isolado de autopromoção (sem mudar regras)

Baseline da 6.10.14.1: 39/39 testes gerais, 27/27 chamados, um estouro geral de expressões em `usuarios update`, zero estouros em chamados. O log geral aponta o cenário `a user cannot self-register or promote their profile to platform admin`; a operação é negada, mas o limite de 1.000 expressões ainda é atingido.

Adicionado `PATIO_RULES_FOCUS=usuarios` ao diagnóstico: executa apenas o teste existente de autopromoção em `functions/tests/firestore/subscriptions.rules.test.mjs`, usando `--test-name-pattern`, e coleta os relatórios padrão de cobertura. Os demais testes da suíte são ignorados nesse modo, não removidos. **Não foi alterado `firestore.rules`**; não houve modificação de autenticação, escopos de empresa ou autorização de assinatura.

### Executar no Firebase Emulator (somente testes)

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=usuarios PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610142-usuarios npm run test:rules:diagnose
```

Enviar quatro arquivos: `/tmp/patio-rules-610142-usuarios-summary.json`, `/tmp/patio-rules-610142-usuarios.log`, `/tmp/patio-rules-610142-usuarios-coverage.json` e `/tmp/patio-rules-610142-usuarios-coverage.html` (se disponíveis). O JSON de cobertura permite analisar os pontos da regra avaliados e identificar se a rejeição ocorre no ramo de autoatualização ou nos ramos de administração. Não atribuir a causa a um ramo específico sem ler a cobertura.

A seguir, apenas depois da análise da cobertura, propor correção pontual e executar novamente o diagnóstico isolado e o completo. Sem deploy, publicação de regras, escrita em produção, serviços pagos ou alteração em `main`.


## Etapa 6.10.14.3 — Guarda global de autopromoção e testes separados (experimental)

Após a cobertura da 6.10.14.2, a regra `usuarios/{id}` foi ajustada para envolver os três ramos `OR` de `allow update` com uma guarda de rejeição de autopromoção (somente quando `request.auth.uid == id`, perfil anterior diferente de `Administrador Geral` e novo perfil igual a `Administrador Geral`). A guarda deve bloquear o caso antes de avaliar ramos administrativos, sem modificar suas condições internas. A alteração anterior da 6.10.14.1 não estava presente na branch remota; a implementação da 6.10.14.3 foi feita diretamente sobre a versão remota atual.

O teste antigo que combinava autocadastro indevido e autopromoção foi dividido em dois testes, e `PATIO_RULES_FOCUS=usuarios` foi atualizado para ambos. Portanto, o total geral esperado passou de **39 para 40 testes** (chamados permanece em 27).

### Validação local (somente Firebase Emulator)

```bash
git pull --ff-only origin fix/push-worker-security-reliability
PATIO_RULES_FOCUS=usuarios PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610143-usuarios npm run test:rules:diagnose
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610143 npm run test:rules:diagnose
PATIO_RULES_FOCUS=chamados PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610143-chamados npm run test:rules:diagnose
npm test
npm run build
```

Enviar summaries e logs do diagnóstico isolado e geral, além do summary de chamados. Critérios: isolado 2/2, geral 40/40, chamados 27/27, zero estouros de expressões no isolado e nos chamados, idealmente zero no geral, sem regressões de autorização. Se o estouro persistir ou surgir qualquer regressão, não publicar regras e reavaliar/voltar atrás na guarda. Não houve deploy, publicação de regras, escrita em produção ou serviço pago.


## Etapa 6.10.14.4 — Controle experimental de orçamento (somente Emulator)

A cobertura da 6.10.14.3 registrou 2/2 testes isolados e 40/40 gerais aprovados, mas ainda 1 estouro do limite de 1.000 expressões na atualização de `usuarios/{id}`. O arquivo de teste prepara `usuarios/self-escalation`; não há prova de ausência do documento.

O experimento compara a regra original com uma **cópia temporária que define apenas `usuarios/{id} allow update: if false`**. A segunda variante é um controle diagnóstico deliberadamente restritivo, **não deve ser publicada nem usada como regra final**. O script cria a cópia em `/tmp`, executa somente os dois testes negativos de privilégio no Firestore Emulator `demo-patio-pro-log` e produz relatórios separados. A suíte de teste aceita a variável opcional `PATIO_RULES_TEST_RULES_PATH`; sem ela, usa `firestore.rules` normalmente. O diagnóstico usa o mesmo arquivo para categorizar as linhas.

```bash
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-rule-budget.mjs
```

Enviar `/tmp/patio-rules-610144-comparison.json`, `/tmp/patio-rules-610144-baseline-summary.json` e `/tmp/patio-rules-610144-deny-update-control-summary.json`, além dos logs se houver erro. Esperado: ambos os conjuntos de 2 testes negativos passam; baseline reproduz o orçamento e controle o elimina. Se controle ainda tiver orçamento, investigar o comportamento de avaliação/relatórios do Emulator e regras sobrepostas. Se controle zerar, isolar os custos da expressão de `allow update` sem transformar a regra de bloqueio total em solução. Não fazer deploy nem alterar produção.


## Etapa 6.10.14.5 — Experimento isolado de guarda de autopromoção

A etapa 6.10.14.4 confirmou no Emulator: baseline 1 estouro de 1.000 expressões; controle `usuarios allow update: if false` zero estouros; ambos os testes negativos passaram. O controle não é solução de produção.

Este experimento mantém `firestore.rules` intacto e gera em `/tmp` uma cópia que substitui apenas a guarda inicial de `usuarios/{id} allow update` por `isNotSelfPromotion(id, resource.data, request.resource.data)`, com expressão booleana equivalente e checagem barata primeiro. As três ramificações de autorização continuam na mesma ordem. O script executa baseline isolada, variante isolada, variante geral e variante de chamados, todos no Emulator `demo-patio-pro-log` sem publicar regras.

```bash
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-guard-610145.mjs
npm test
npm run build
```

Arquivos solicitados: `/tmp/patio-rules-610145-comparison.json` e os quatro `/tmp/patio-rules-610145-*-summary.json`; se falhar, anexar também o log correspondente. Meta: 2/2 testes isolados, 40/40 gerais, 27/27 chamados e zero estouros na variante. Se a variante continuar com 1 estouro, investigar a avaliação do caminho de `usuarios/{id} allow update` em vez de aplicar a guarda sem evidência. Mesmo que zere, exigir testes positivos de atualização legítima de usuários e revisão da equivalência de permissões antes de propor alteração em `firestore.rules`. Não fazer deploy, não alterar `main`, não usar serviços pagos.


## Etapa 6.10.14.6 — Diagnóstico por ramificações de usuarios/update

A etapa 6.10.14.5 executou 2/2 testes negativos isolados, 40/40 gerais e 27/27 de chamados, mas o orçamento de 1.000 expressões permaneceu em `usuarios/{id} allow update`. A extração da guarda para função auxiliar não corrigiu o custo.

O script `scripts/firebase/experiment-user-branches-610146.mjs` gera em `/tmp` três versões **exclusivamente diagnósticas** das regras. Cada versão mantém a guarda global de autopromoção e **uma** das três ramificações originais (autorrevisão, gerenciamento por Administrador Geral, gerenciamento por Administrador da Empresa); as outras são substituídas por condições `false && ...`, preservando o código para comparação. Uma baseline original é executada primeiro. São executados os dois testes negativos isolados em cada variante, nunca a suíte positiva sob regras intencionalmente restritivas. Nenhuma versão é publicável.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-branches-610146.mjs
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610146-original-all npm run test:rules:diagnose
npm test
npm run build
```

Enviar `/tmp/patio-rules-610146-comparison.json` e os quatro `/tmp/patio-rules-610146-*-summary.json`, além dos logs se necessário. A suíte geral original serve de referência para não aceitar uma alteração que invalide permissões legítimas. Os testes negativos isolados são insuficientes para aprovar produção. Depois de identificar a ramificação onerosa, acrescentar testes positivos de autorrevisão e administração empresarial/plataforma e validar equivalência antes de qualquer proposta de mudança nas regras oficiais. Sem deploy, alterações de `main` ou serviços pagos.


## Etapa 6.10.14.7 — Comparação par a par das ramificações de usuarios/update

Na etapa 6.10.14.6, a baseline dos dois testes negativos isolados apresentou 1 estouro do limite de 1.000 expressões. Cada variante com apenas uma ramificação (`self`, `platform` ou `company`) teve 0 estouros, embora ainda houvesse erros genéricos de avaliação.

O script `scripts/firebase/experiment-user-pairs-610147.mjs` cria cópias temporárias em `/tmp` e compara baseline com três pares de ramificações: `self+platform`, `self+company`, `platform+company`. Cada variante mantém a guarda global de autopromoção, desativa a terceira ramificação com `false &&` e executa somente os dois testes negativos isolados no Firebase Emulator. **As variantes não preservam todas as permissões legítimas e nunca devem ser publicadas.** `firestore.rules` permanece intacto.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-pairs-610147.mjs
PATIO_RULES_REPORT_PREFIX=/tmp/patio-rules-610147-original-all npm run test:rules:diagnose
npm test
npm run build
```

Enviar `/tmp/patio-rules-610147-comparison.json`, `/tmp/patio-rules-610147-baseline-summary.json`, `/tmp/patio-rules-610147-pair-self-platform-summary.json`, `/tmp/patio-rules-610147-pair-self-company-summary.json` e `/tmp/patio-rules-610147-pair-platform-company-summary.json`. Caso algum teste falhe, anexar o log da variante. O objetivo é identificar se alguma combinação de duas ramificações reproduz o estouro; resultado com 0 estouros não comprova equivalência de autorização. A correção final dependerá de testes positivos para operações legítimas e revisão das permissões multiempresa. Não fazer deploy, não alterar `main` nem usar serviços pagos.


## 6.10.14.9 — Teste de equivalência de atualizações de usuários

A etapa 6.10.14.8 identificou que a condição antecipada `request.auth.uid != id` na ramificação empresarial elimina o estouro no teste negativo isolado, mas pode retirar permissões legítimas de autoatualização administrativa.

Arquivos: `functions/tests/firestore/user-update-610149.rules.test.mjs`, `scripts/firebase/experiment-user-equivalence-610149.mjs`. O diagnóstico admite o foco `PATIO_RULES_FOCUS=usuarios-validacao`.

O experimento compara as regras originais e a candidata temporária em dois conjuntos: testes negativos existentes de autopromoção e sete casos de validação, incluindo autoatualização, administração da própria empresa, isolamento entre empresas, gerenciamento pela plataforma e regressão de autoatualização por administrador empresarial. Uma falha de teste não interrompe a comparação; o relatório final sinaliza reprovação. **Não publicar a candidata.**

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-equivalence-610149.mjs
npm test
npm run build
```

Enviar `/tmp/patio-rules-610149-comparison.json`, os quatro `/tmp/patio-rules-610149-*-summary.json` e, se houver falhas, os logs correspondentes. O experimento usa somente o Firebase Emulator e não altera regras oficiais, serviços pagos ou produção.


## 6.10.14.10 — Ordem de verificações da ramificação empresarial

Os logs da 6.10.14.9 confirmaram regressão da variante `request.auth.uid != id`: o teste de atualização do próprio status por administrador empresarial passou no baseline e falhou na candidata. A mesma candidata manteve dois estouros de 1.000 expressões em negativas de escopo/permissão.

O script `scripts/firebase/experiment-user-guard-order-6101410.mjs` gera **apenas regras temporárias para o Emulator**, mantendo a ramificação original e acrescentando verificações já exigidas por `canAdminEmpresaManageUser` antes do `diff` e da validação de escopo. Variantes: `tenant-first`, `role-first`, `role-and-tenant-first`. Nenhuma adiciona `request.auth.uid != id`. O baseline e as três variantes executam os testes de segurança isolados (`usuarios`) e os sete testes legítimos (`usuarios-validacao`). O relatório contém contagens e associação aproximada dos diagnósticos aos testes TAP.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-guard-order-6101410.mjs
npm test
npm run build
```

Enviar `/tmp/patio-rules-6101410-comparison.json` e os resumos `/tmp/patio-rules-6101410-*-summary.json`; em caso de falha, enviar os logs correspondentes. O script pode terminar com código 1 se nenhuma variante satisfizer os critérios; isso é resultado diagnóstico, não autorização para remover controles. Preservar alterações locais, especialmente `.env.example`. Não realizar deploy nem alterar regras oficiais, branch `main`, faturamento ou serviços pagos.


## 6.10.14.11 — Ordem das três ramificações de autorização (Emulator)

Os resultados 6.10.14.10 indicaram que antecipar isoladamente o papel ou o vínculo empresarial não diminuiu os estouros e que repetir ambos aumentou as ocorrências e causou falhas. Nesta etapa, o script `scripts/firebase/experiment-user-or-order-6101411.mjs` mantém as mesmas condições e o mesmo bloqueio global de autopromoção, alterando somente a ordem das três ramificações OR de `usuarios.update`.

Variantes: `baseline`, `company-self-platform`, `company-platform-self`, `platform-company-self` e `platform-self-company`. Cada variante executa os dois testes negativos isolados e os sete testes de atualizações legítimas/negações de escopo; agrega códigos de saída, budget, erros de avaliação e associação aproximada por teste. Esta associação é heurística, e `assertFails` não prova que a regra negou sem erro. Uma melhoria exige todos os testes aprovados, ausência de orçamento e nenhum aumento de erros de avaliação. O experimento não altera `firestore.rules` e **nenhuma variante temporária pode ser implantada**.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-or-order-6101411.mjs
npm test
npm run build
```

Enviar `/tmp/patio-rules-6101411-comparison.json` e os resumos `/tmp/patio-rules-6101411-*-summary.json`; logs de qualquer cenário anormal. O comando experimental pode retornar código 1 e ainda gerar relatórios completos. Sem deploy, sem mudança de branch main, faturamento, IAM ou serviços pagos. Preservar alterações locais, inclusive `.env.example`.


## 6.10.14.12 — Isolamento de custo da função empresarial

Script de diagnóstico `scripts/firebase/experiment-user-helper-isolation-6101412.mjs`: executa baseline e cinco substituições temporárias **intencionalmente inseguras** da chamada `canAdminEmpresaManageUser(resource.data, request.resource.data)` somente no bloco `usuarios.update`. As substituições são `company-disabled`, `actor-only`, `actor-and-existing-tenant`, `actor-and-both-tenants`, `actor-and-vinculo`. Elas servem apenas para localizar a contribuição relativa de verificações da função; **nenhuma é candidata a publicação, independentemente de passar testes**. Comparar os dois conjuntos (`usuarios` e `usuarios-validacao`) e os diagnósticos associados a cada teste. Um `assertFails` aprovado pode representar erro de avaliação, não negação limpa.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-helper-isolation-6101412.mjs
npm test
npm run build
cd /tmp
zip -j patio-rules-6101412-resultados.zip patio-rules-6101412-*.json patio-rules-6101412-*.log
```

Enviar `/tmp/patio-rules-6101412-resultados.zip`. O experimento pode sair com código 1 devido às regressões esperadas em variantes inseguras. Sem mudanças em `firestore.rules`, deploy, produção, branch main, IAM, faturamento ou serviços pagos. Preservar alterações locais, incluindo `.env.example`.


## 6.10.14.13 — Cache local do documento do administrador (Emulator)

Script `scripts/firebase/experiment-user-actor-cache-6101413.mjs`: compara baseline com duas variantes temporárias da função empresarial de `usuarios.update`. A primeira lê uma vez o documento `usuarios/{request.auth.uid}` em uma variável local e reutiliza seus campos para status, perfil e empresa. A segunda faz o mesmo e avalia perfil antes de status. Em ambas são preservadas as verificações explícitas contra Administrador Geral, os dois vínculos de empresa e `isUsuarioVinculoValido`. A equivalência ainda precisa ser provada; **nenhuma variante está autorizada para deploy**.

Executar somente no projeto de emulação `demo-patio-pro-log`:
```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-actor-cache-6101413.mjs
npm test
npm run build
cd /tmp
zip -j patio-rules-6101413-resultados.zip patio-rules-6101413-*.json patio-rules-6101413-*.log
```

Enviar o ZIP para análise dos testes de segurança (`usuarios`) e permissões legítimas (`usuarios-validacao`). Mesmo que todos passem, ampliar a matriz com usuário ausente, inativo, status ausente, perfis inválidos, mudança de empresa e de supermercado antes de considerar uma otimização. `assertFails` aceita erros de avaliação como negativa; consultar logs/coverage. Preservar arquivos locais (especialmente `.env.example`). Nenhuma mudança em `firestore.rules`, produção, `main`, deploy ou serviços pagos.


## 6.10.14.14 — Diagnóstico de negação antecipada de promoção (Emulator)

O script `scripts/firebase/experiment-user-early-denial-6101414.mjs` gera três regras temporárias no diretório `/tmp`, preservando o baseline e sem modificar `firestore.rules`. Compara (1) forma De Morgan do bloqueio global de autopromoção, (2) verificação antecipada de tentativa de gravar perfil `Administrador Geral` para outro UID, e (3) combinação das duas. O segundo bloqueio é uma hipótese a validar, não equivalência comprovada. Os testes atuais incluem segurança, autoatualização do administrador empresarial e isolamento entre empresas; revisar logs de negativas pois `assertFails` também aceita erros de avaliação. Nenhuma variante temporária está aprovada para deploy.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-early-denial-6101414.mjs
npm test
npm run build
cd /tmp
zip -j patio-rules-6101414-resultados.zip patio-rules-6101414-*.json patio-rules-6101414-*.log
```

Enviar `/tmp/patio-rules-6101414-resultados.zip`. O experimento pode retornar código 1 mesmo após gerar relatórios completos. Não realizar deploy, operações em produção, mudanças em `main`, IAM, faturamento ou serviços pagos. Preservar alterações locais, especialmente `.env.example`.


## 6.10.14.15 — Cobertura individual por operação de usuários

O runner `scripts/firebase/diagnose-firestore-rules.mjs` recebeu suporte opcional à variável `PATIO_RULES_TEST_PATTERN`, restrita aos focos `usuarios` e `usuarios-validacao`. O script `scripts/firebase/diagnose-user-coverage-6101415.mjs` executa **nove casos individualmente**, sempre usando as regras baseline em `firestore.rules` e o projeto fictício `demo-patio-pro-log`. Cada caso reinicia o Emulator, registra logs, resumo e `ruleCoverage` em JSON/HTML quando disponível. O `comparison.json` agrega resultado por teste, diagnóstico de budget/erro e pontos de cobertura com contagem, se presentes no formato devolvido pelo Emulator. A ausência de pontos legíveis não invalida os arquivos brutos de cobertura.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/diagnose-user-coverage-6101415.mjs
npm test
npm run build
cd /tmp
zip -j patio-rules-6101415-resultados.zip patio-rules-6101415-*.json patio-rules-6101415-*.log patio-rules-6101415-*.html
```

Enviar `/tmp/patio-rules-6101415-resultados.zip`. Nenhuma candidata de regra é gerada ou aprovada nesta etapa. `assertFails` pode passar quando a negação é consequência de orçamento ou erro. A cobertura ajuda a localizar expressões executadas, mas não prova causalidade; ler os logs e cobertura bruta antes de propor refatorações. Nenhum deploy, mudança em `firestore.rules`, `main`, faturamento, IAM ou serviços pagos. Preservar edições locais, inclusive `.env.example`.


## 6.10.14.16 — Contexto de autenticação compartilhado nas três ramificações

Criado o experimento `scripts/firebase/experiment-user-shared-actor-6101416.mjs`, **exclusivo do Emulator**. Ele compara `firestore.rules` oficial (sem modificá-lo) com uma regra temporária cuja função `stage161UpdateUser` centraliza a leitura do documento autenticado e reaproveita status, perfil e empresa nos caminhos de autoatualização, administrador da plataforma e administrador da empresa. Conserva o bloqueio global de autopromoção, os vínculos de origem e destino, a validação de vínculo e os campos modificáveis. Essa versão é somente uma hipótese: diferenças sutis entre regras originais e refatoradas precisam ser detectadas por testes; **não usar em produção**.

O runner executa nove operações separadamente para baseline e variante, com logs, contagem de orçamentos/erros e cobertura. As negativas `assertFails` podem passar mesmo com erros; exigir inspeção dos logs brutos. Sem equivalência formal nem ampliação da matriz negativa (usuários inativos/ausentes, status inválidos, empresas diferentes, elevação de privilégios), nenhuma candidata será aprovada para publicação.

```bash
git status --short
git pull --ff-only origin fix/push-worker-security-reliability
node scripts/firebase/experiment-user-shared-actor-6101416.mjs
npm test
npm run build
cd /tmp
zip -j patio-rules-6101416-resultados.zip patio-rules-6101416-*.json patio-rules-6101416-*.log
```

Enviar `/tmp/patio-rules-6101416-resultados.zip`; caso o runner encerre com código 1, preservar os relatórios. Não alterar `firestore.rules`, a branch `main`, configurações de faturamento/IAM, Firebase ou Vercel em produção. Preservar alterações locais, especialmente `.env.example`.
