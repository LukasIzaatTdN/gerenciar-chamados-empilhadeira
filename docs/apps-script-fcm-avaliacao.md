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
