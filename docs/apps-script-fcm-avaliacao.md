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
