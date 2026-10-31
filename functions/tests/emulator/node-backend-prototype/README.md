# Protótipo local de confirmação — Node.js + Firebase Admin

Escopo: prova técnica isolada da Etapa C.6.3. O servidor só inicia com os hosts locais do Auth Emulator e Firestore Emulator e rejeita `projectId` que não comece por `demo-`. Não contém integração com o Web, Android, Functions, serviço externo ou produção.

## Executar

Na raiz do repositório:

```sh
firebase emulators:exec --config firebase.emulator.node-backend-prototype.json --only auth,firestore --project demo-patio-confirmation "node --test functions/tests/emulator/node-backend-prototype/prototype.test.mjs"
```

O Firebase CLI iniciou Auth Emulator na porta `19991` e Firestore Emulator na `19993`; o servidor HTTP local usa `19995`. Os dados são sintéticos e descartados quando os Emulators encerram.

## Contrato implementado

`POST /v1/separation-confirmations`

```json
{
  "operationId": "UUID",
  "pedidoId": "pedido-id",
  "itemId": "item-id-estavel",
  "origem": "direta",
  "quantidade": 2,
  "justificativa": ""
}
```

No caminho `empilhadeira`, acrescentar `chamadoId`. A autenticação usa `Authorization: Bearer <Firebase ID token>`. Erros retornam `{ "error": { "code", "message" } }`; sucessos retornam `{ "result": ... }`. Rotas e cabeçalhos `__test` só existem com `PATIO_PROTOTYPE_TEST_MODE=1`.

O endpoint verifica token e revogação, depois lê o documento atual do usuário, pedido, atribuição V2 e unidade. Para uma operação nova, a transação também lê item individualizado e, no caminho com empilhadeira, chamado e cadastro da empilhadeira. Direto e empilhadeira alteram o mesmo saldo em `chamados/{pedidoId}/itens/{itemId}`. Uma transação grava item, recibo, auditoria e `separacao_operacoes/{operationId}`; o hash SHA-256 cobre UID e parâmetros canônicos. Um retry com o mesmo ID e fingerprint devolve o resultado anterior. Um ID já usado com payload diferente falha.

## Resultados executados

Última rodada completa no Auth e Firestore Emulator: **11/11 testes passaram**.

| Cenário | Resultado observado |
|---|---|
| Token inválido e token revogado | 401 antes de confirmar |
| Usuário inativo e perfis Gerente, Operador e Televendas | 403 |
| Separador ativo com atribuição V2 válida | 200; item, recibo, auditoria e operação criados juntos |
| Atribuição removida ou empresa incompatível | 403 |
| Empilhadeira com chamado finalizado e vinculado | 200; saldo no mesmo documento de item |
| Chamado da empilhadeira não finalizado | 409 |
| Mesmo operationId e payload | resultado replayado, sem novas gravações |
| Mesmo operationId e payload diferente | 409 |
| Direta contra direta; direta contra empilhadeira | em cada disputa, uma confirmação vence e outra excede saldo; apenas um recibo |
| Resposta perdida após commit e retry | retry recuperou resultado sem duplicar recibo |
| Cliente SDK: array/agregados, saldo do item, recibo e auditoria | todas as tentativas testadas foram negadas pelas Rules locais atuais |

### Leituras e gravações instrumentadas

- Confirmação direta sem disputa: **8 leituras de documentos na transação, 4 gravações comprometidas**, uma tentativa, aproximadamente 284 ms na última rodada. As quatro gravações são item, recibo, auditoria e registro de operação.
- Confirmação por empilhadeira: **10 leituras** (chamado e cadastro da empilhadeira além das 8 do caminho direto), 4 gravações comprometidas.
- Disputas: o Firestore SDK repetiu a transação que perdeu o conflito. Foram observadas duas tentativas e 16 leituras acumuladas para o pedido/item em disputa; a tentativa perdedora terminou com zero gravações comprometidas após correção do contador.
- Esses números são contadores da transação do protótipo, não medição faturável nem benchmark de produção. Não incluem validação do ID token no Auth Emulator, rede, logs ou custo real.
- Os logs de Rules mostraram `PERMISSION_DENIED` em alterações de pedido/item e `No matching allow statements`/negação em recibo e auditoria. Nenhum dado pessoal ou token foi registrado.

## Limites e pendências

- Os Emulators demonstram comportamento local do SDK e das Rules carregadas nesta cópia de trabalho; não provam comportamento de Rules publicadas, IAM, disponibilidade, latência externa, limites Spark nem acesso externo ao Firestore com o projeto Firebase real.
- O Auth Emulator aceita tokens de teste e não equivale à validação de chaves públicas/JWKS em produção. A revogação foi exercitada pelo SDK contra o Emulator, mas precisa de validação de arquitetura e teste num ambiente autorizado antes de uso real.
- O servidor Admin contorna Firestore Rules. As Rules locais negaram os casos de escrita direta testados, porém isso não prova todos os escritores antigos nem todos os documentos/fluxos. Revalidar os escritores Web/Android e as Rules ativas antes de qualquer integração.
- O protótipo não implementa CORS de domínio, rate limiting, App Check, IAM, rotação de credenciais, retenção de logs ou monitoramento de hospedagem. Não foi criado segredo ou chave de serviço. O projeto Firebase Spark e acesso real pelo backend externo não foram usados nesta prova.
- O teste de resposta perdida usa uma falha de conexão injetada localmente depois do commit; é uma simulação repetível, não uma interrupção real de rede de hospedagem.
- Nenhuma migração de pedidos legados ocorreu. O endpoint pressupõe documentos de item individualizados com IDs estáveis; pedidos em array não são aceitos.
- A integração Web permanece bloqueada até decisão e prova autorizada: modernizar contrato de itens, remover fallback para escrita direta, planejar compatibilidade dos clientes legados, definir CORS/abuso/segredos e verificar Spark/IAM sem habilitar billing.

## Classificação das conclusões

- **Confirmada por código e teste local:** token verificado; perfil/atribuição V2 consultados no servidor; confirmações direta e por empilhadeira; limite de saldo; recibo/auditoria/operação atômicos; replay e concorrência; as gravações diretas cobertas foram negadas pelas Rules locais.
- **Pendente de teste/autorização:** Firebase Spark real com backend externo; regras publicadas; política IAM e credencial de runtime; limites, disponibilidade e latência de hospedagem; proteção operacional para tráfego público; integração e compatibilidade com os escritores Web/Android existentes.
