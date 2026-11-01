# Etapa 6.2.1 — sincronização dos perfis

## Resultado e limites

Causa raiz comprovada: o Web promovia cadastros legados ao contrato v2 pela mera presença de `supermercado_ids`, enquanto a release efetivamente publicada no Firebase não possui autorização para `usuarios/{uid}/unidades/{unidadeId}`. Os documentos de vínculo candidatos também não existem nos registros de produção examinados. O `permission-denied` é convertido em conjunto de unidades validadas vazio; o seletor recebe esse conjunto vazio.

A correção de cliente foi implementada **somente localmente**. Não houve commit, push, deploy, publicação, alteração de Rules ativas, dados reais, vínculos, Android ou design nesta etapa. HEAD inicial: `f75b394`; arquivos existentes estavam limpos. O commit pertence à etapa anterior e foi preservado.

Esta investigação não equivale à homologação de todas as contas reais: os testes funcionais de autorização foram executados no Firebase Emulator. As consultas de produção foram somente leitura, usando a conta já configurada no Firebase CLI. Não foram solicitadas ou expostas senhas, tokens de sessão ou documentos completos de usuários.

## Evidência em produção — somente leitura

O projeto é `painel-772bf`, Firestore Standard, banco `(default)`.

- Foram examinados 21 documentos de usuários e 19 registros Auth, com limite de 100 por consulta; os resultados não foram truncados.
- Os IDs armazenados nos 21 documentos coincidem com seus caminhos de documento.
- 18 caminhos de documento correspondem a uma conta Auth; três documentos de Televendas não têm conta Auth correspondente. Uma conta Auth não tem documento de usuário nesse recorte.
- Os **dois Separadores ativos** têm UID correspondente no Auth, lista de uma unidade, modo v2 não explicitamente habilitado e documento de vínculo candidato inexistente. Logo, a falha desses Separadores não é explicada por divergência entre UID e caminho.
- Todos os 21 cadastros possuem array `supermercado_ids`; nenhum habilita explicitamente `vinculos_unidades_v2: true`.
- Os 22 documentos de vínculo candidatos, derivados das listas declaradas, foram consultados e não existem. Os registros reais não foram modificados para criá-los.
- Não há Gerente da Empresa nos documentos desse recorte. O perfil foi coberto por fixtures no Emulator; não foi criada conta de produção para testes.

Detalhes agregados, sem nomes, e-mails, tokens, UIDs ou IDs de unidades: [production-readonly-summary.json](./production-readonly-summary.json).

### Leitura privilegiada versus autorização do aplicativo

A consulta via conta do CLI permite verificar **existência** de documentos independentemente das Rules do cliente. Ela não prova permissão de leitura do Separador. Essa permissão foi avaliada separadamente no Emulator com as regras baixadas da release e UID de cliente simulado: a leitura de um vínculo existente também é negada pela release publicada. Portanto, não se confundiram documento inexistente, UID divergente e operação negada por regra.

## Caminho da falha

1. A autenticação resolve `usuarios/{firebaseUser.uid}`.
2. A expressão antiga `flag === true || Array.isArray(supermercado_ids)` converte um cadastro legado em v2 somente no estado do cliente.
3. [useUnidadesAtribuidas.ts](../../../src/hooks/useUnidadesAtribuidas.ts) tenta ler os documentos conhecidos da subcoleção. Não é uma consulta global de vínculos.
4. A release publicada não possui `match` para esse caminho. O cliente recebe `permission-denied`, mesmo que um documento seja criado por uma conta privilegiada.
5. O hook remove o ID do conjunto validado e expõe a falha. `useSupermercados.ts` recebe zero IDs autorizados e não inicia uma consulta operacional ampla.
6. O perfil mostra “Unidade não definida” e o seletor fica vazio. Esse resultado não demonstra que as unidades tenham sido apagadas.

O modo de demonstração usado anteriormente para conferir o redesign é uma condição separada: ele não explica uma negação de vínculos com Firebase real conectado.

## Arquivos envolvidos e correção local

| Arquivo | Investigação / alteração |
| --- | --- |
| [App.tsx](../../../src/App.tsx) | Usa a normalização compartilhada; exige correspondência do UID da sessão com Auth; aguarda hidratação e UID confirmado antes dos listeners; expõe falha de leitura de perfil no alerta já existente. |
| [useUsuarios.ts](../../../src/hooks/useUsuarios.ts) | Usa o caminho de documento como ID canônico; deixa de inferir v2 por array; expõe `syncError`; corrige dependências do callback de gestão para não usar perfil/lista anteriores. |
| [useUnidadesAtribuidas.ts](../../../src/hooks/useUnidadesAtribuidas.ts) | Mantém leitura de documentos conhecidos, sem fallback após negação v2. Gerente sempre precisa de vínculo validado, mesmo se sua flag estiver ausente. |
| [userUnitAssignments.ts](../../../src/utils/userUnitAssignments.ts) | Centraliza a interpretação: somente o booleano explícito `true` ativa v2; limite de oito, listas inválidas/duplicadas e lista vazia continuam sem ampliar escopo. |
| [useSupermercados.ts](../../../src/hooks/useSupermercados.ts), [useUnidades.ts](../../../src/hooks/useUnidades.ts) e [useEmpresas.ts](../../../src/hooks/useEmpresas.ts) | Recebem `authReady` para não abrir consultas durante a resolução da identidade; os filtros existentes por ID, empresa e status foram preservados. |
| [firestore.rules](../../../firestore.rules) | Revisado, não alterado. O arquivo local contém um contrato mais novo que o publicado. |

### Controles preservados

- Administrador Geral mantém acesso global, inclusive a correção anterior que ignora vínculo legado de empresa na visão global.
- Gerente não herda acesso global nem um fallback legado sem vínculo.
- Operador, Televendas e Separador usam apenas os IDs declarados; as Rules continuam sendo a autoridade final.
- Um usuário explicitamente v2 **não é rebaixado a legado** após `permission-denied`, ausência ou inatividade de vínculo.
- A normalização não escreve flags ou vínculos em produção.
- Consultas de empresas/unidades aguardam `authReady`; a consulta pública anterior ao login fica restrita à condição realmente sem usuário Auth, sem tratar uma sessão autenticada ainda não resolvida como visitante.
- O desenho e os componentes visuais do redesign permanecem intactos; o tratamento de erros reutiliza o alerta global existente.
- O fallback por claims já existente em autenticação foi preservado, mas sua tentativa deixa de ocultar o erro de leitura do perfil. Ele não substitui a autorização Firestore de cada consulta.

## Regras locais versus publicadas

Release consultada: `projects/painel-772bf/releases/cloud.firestore`.
Ruleset: `projects/painel-772bf/rulesets/1589914b-62c5-4650-b42a-5c4d5a4a368c`.
Última atualização da release: `2026-10-31T05:02:45.741202Z`.

| Contrato | Local | Publicado |
| --- | --- | --- |
| Subcoleção de vínculos | Existe regra de leitura para dono/Admin e escrita restrita ao Admin. | Não possui `match` para a subcoleção. |
| Flag v2 / vínculo ativo | Acesso restrito considera documentos de vínculo e exige vínculo para Gerente. | O contrato antigo decide a leitura pela unidade principal; não implementa revogação por vínculo v2. |
| Múltiplas unidades | Contrato explícito, máximo de oito e verificações por empresa/unidade. | Contrato antigo centrado em `supermercado_id`. |
| Gestão dos usuários | Gestão centralizada e vínculos atômicos. | Fluxo anterior de Admin Empresa/convites e atualização da unidade no próprio perfil. |
| Metadados da empresa | `belongsToEmpresa()` retorna `false`; perfis operacionais não leem a própria empresa por esse caminho. | Usuário ativo pode ler os metadados da própria empresa. |
| SaaS e outras coleções | Inclui outras alterações além dos vínculos. | Não é equivalente ao arquivo local. |

**Não é seguro publicar o arquivo local inteiro como correção pontual desta falha.** Há diferenças de gestão, SaaS e operações além do caminho de vínculos. É necessária proposta de migração restritiva e compatibilidade avaliada separadamente.

Arquivos de evidência:

- [Metadados e hashes](./rules-comparison.json), com definição explícita da normalização dos hashes.
- [Cópia imutável das regras publicadas](./published.firestore.rules), utilizada apenas como fixture de leitura/teste, não como configuração de deploy.
- [Diff completo publicado → local](./rules-comparison.diff).
- [Avaliação de segurança focada, em JSON](./rules-audit.json).

## Relação com as mudanças visuais

A inferência incorreta de v2 já existe em `eb8b616` (31/10/2026, 00:49:31 -0400), antes das alterações visuais analisadas nesta sessão. O pai de `d26f231` já consultava a subcoleção inteira de vínculos. Em `d26f231`, a leitura passou a usar documentos conhecidos, mas ambos os caminhos continuam negados por uma release sem regra para a subcoleção.

Os commits de redesign desta sessão (`057dac2` e `d49ab40`) não introduziram a expressão que promove o array a v2. O bloqueio preexiste ao redesign analisado; a divergência de contratos e a inferência do cliente foram preservadas, e a tela de perfil tornou o sintoma visível.

## Testes executados

| Verificação | Resultado final |
| --- | --- |
| Regressão existente de acesso a unidades e consultas multiunidade, Rules locais | **23/23** aprovados. |
| Nova matriz versionada, Rules locais + snapshot publicado, cinco perfis | **56/56** aprovados, incluindo casos cujo objetivo é **reproduzir falhas/incompatibilidades da release publicada**. |
| Testes Web, incluindo regressão da normalização | **26/26** aprovados. |
| TypeScript (`tsc --noEmit`) | Aprovado. |
| Build final | Aprovado; saída temporária fora do checkout, sem sobrescrever `dist`. |
| `git diff --check` | Aprovado. |
| Navegador Web + Auth/Firestore Emulator | Cinco perfis com seletor populado no contrato local; Separador legado e v2 comparados também com snapshot publicado. Ver limites abaixo. |

### Verificação da interface com contas fictícias

Foi usada uma aba isolada em `http://127.0.0.1:5174/`, projeto `demo-patio-pro-log`, Auth Emulator `29099` e Firestore Emulator `28080`. Foram criadas somente fixtures no Emulator, sem operar a sessão real compartilhada. O Vite foi iniciado em `mode: emulator` com overrides de porta por variáveis de ambiente; o arquivo de ambiente do usuário não foi modificado.

- Com regras locais, Administrador Geral recebeu as duas unidades ativas das duas empresas; Gerente com vínculo ativo, Operador, Televendas e Separador receberam somente uma unidade atribuída. A unidade inativa não apareceu.
- A leitura da própria empresa foi negada pelas regras locais e o alerta ficou visível no Gerente e no Separador. Isso é uma divergência adicional do contrato local, não ausência de unidades e não foi ocultado. O seletor continuou populado. Não foi concedido acesso adicional para eliminar o alerta.
- Após carregar **somente no Emulator** o snapshot publicado, Separador legado recebeu sua unidade e nenhum alerta de sincronização.
- No mesmo snapshot, Separador explicitamente v2, mesmo com vínculo ativo existente, exibiu exatamente `Falha ao validar os vínculos de unidade (permission-denied).` e apenas a opção inicial do seletor. Confirma-se que a correção não faz fallback após uma negação v2.

Esta verificação cobre hidratação Auth, troca das contas fictícias, abertura do perfil, seletor e alerta. Não é homologação das demais rotinas operacionais, de cadastro, das cinco contas reais ou de um release publicado.

### Interpretação importante da matriz

A aprovação dos testes `REPRODUÇÃO publicada` significa que a incompatibilidade ou limitação foi reproduzida, **não** que essa política esteja homologada. Em particular, os testes comprovam que:

- a release nega leitura e listagem dos vínculos para os quatro perfis restritos;
- cadastros legados conseguem consultar sua unidade principal sem documentos v2;
- a release antiga ainda permite leitura da unidade principal quando o documento de vínculo v2 está ausente ou inativo;
- as regras locais negam unidade/vínculo inativo, vínculo ausente, unidade de outra empresa, consulta global operacional, autoatribuição e autopromoção;
- Administrador Geral ativo mantém leitura global e uma conta inativa/UID desconhecido não herda esse acesso.

### Reproduzir

Pré-requisitos usados: JDK 21, Node com suporte a `--experimental-strip-types`, dependências Web e de `functions` instaladas.

```bash
PATIO_FIRESTORE_EMULATOR_PORT=28080 firebase emulators:exec --config firebase.emulator.test.json --only firestore --project demo-patio-pro-log 'node --experimental-strip-types --test functions/tests/firestore/unit-access.rules.test.mjs functions/tests/firestore/multi-unit-queries.rules.test.mjs'

PATIO_FIRESTORE_EMULATOR_PORT=28080 firebase emulators:exec --config firebase.emulator.test.json --only firestore --project demo-patio-pro-log 'node --experimental-strip-types --test functions/tests/firestore/profile-sync.rules.test.mjs'

npm test
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir /tmp/patio-621-final-build-auth-ready
git diff --check
```

A matriz usa somente `demo-patio-621-local` e `demo-patio-621-published`; o aviso do Emulator sobre múltiplos projetos demo é esperado e não representa acesso ao Firebase real.

Código executável: [matriz de regras](../../../functions/tests/firestore/profile-sync.rules.test.mjs), [testes de normalização](../../../src/utils/userUnitAssignments.test.ts).

## Pendências que exigem autorização

1. Publicar qualquer correção Web, fazer commit ou push: **não autorizado nesta etapa e não realizado**.
2. Migrar regras publicadas para o modelo de vínculos: exige autorização específica e uma alteração restritiva, não a publicação integral do arquivo local divergente.
3. Criar/atualizar documentos de vínculo ou flags reais: exige autorização; esta etapa não migra cadastros silenciosamente.
4. Resolver os três documentos de Televendas sem Auth correspondente e a conta Auth sem documento de perfil: exige identificação e decisão sobre cada cadastro antes de alterar dados.
5. Homologar o Gerente e usuários explicitamente v2 em produção depende do contrato de regras e dos vínculos autorizados. As regras locais foram testadas com fixtures válidas; não há Gerente real no recorte consultado.
6. Confirmar a interface final em sessão real de Separador após eventual publicação é uma etapa distinta. Esta entrega comprova a causa, a normalização e a autorização no Emulator; não declara um release publicado.
7. Reconciliar a leitura dos metadados da própria empresa com as regras locais antes de uma migração: o navegador reproduziu a negação local, enquanto o snapshot publicado permite essa leitura. A solução precisa definir os campos necessários e uma leitura restrita à própria empresa; não se propõe acesso global nem alteração silenciosa das Rules nesta etapa.
