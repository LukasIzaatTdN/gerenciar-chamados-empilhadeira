# Painel Empilhadeira

Plataforma web para gestão de chamados operacionais, televendas, empilhadeiras e manutenção em ambiente multiempresa e multiunidade (modelo SaaS).

O sistema foi estruturado para operações com múltiplos supermercados ou centros de distribuição, mantendo isolamento por unidade, controle por perfil e rastreabilidade entre solicitante, operador, equipamento e atendimento.

## Visão Geral

O projeto atende dois eixos principais:

- operação de chamados internos por unidade
- controle técnico das empilhadeiras usadas em cada unidade

Na prática, a aplicação permite:

- abrir chamados operacionais e pedidos de televendas
- acompanhar fila e execução em tempo real
- operar chamados com vínculo de empilhadeira
- registrar checklist diário da máquina
- reportar falhas operacionais
- abrir e acompanhar manutenções
- visualizar dashboards por unidade ou de forma consolidada

## Arquitetura Funcional

### 1. Multiempresa e Multiunidade

O sistema usa `empresa_id` e `supermercado_id` como eixo principal de separação operacional.

Implementado:

- entidade `empresas`
- entidade `supermercados`
- vínculo de `supermercados` por `empresa_id`
- vínculo de `usuarios` por `empresa_id`
- vínculo de `usuarios` por `supermercado_id`
- vínculo de `chamados` por `empresa_id`
- vínculo de `chamados` por `supermercado_id`
- vínculo de `empilhadeiras` por `empresa_id`
- vínculo de `empilhadeiras` por `supermercado_id`
- vínculo de `checklists_empilhadeira` por `empresa_id`
- vínculo de `checklists_empilhadeira` por `supermercado_id`
- vínculo de `manutencoes` por `empresa_id`
- vínculo de `manutencoes` por `supermercado_id`
- visão consolidada para `Administrador Geral`
- visão consolidada da própria empresa para `Administrador da Empresa`

### 2. Perfis de Acesso

Perfis atualmente suportados:

- `Promotor`
- `Funcionário`
- `Operador`
- `Supervisor`
- `Televendas`
- `Administrador da Empresa`
- `Administrador Geral`

Resumo por perfil:

- `Promotor` e `Funcionário`: abrem chamados e acompanham apenas as próprias solicitações da unidade
- `Televendas`: abre pedidos internos com estrutura de itens e acompanhamento específico
- `Operador`: atua na fila operacional da unidade, assume chamados, registra checklist e reporta falhas
- `Supervisor`: acompanha operação, dashboards, empilhadeiras e manutenções da própria unidade
- `Administrador da Empresa`: gerencia usuários, unidades, ativos e operação apenas da empresa vinculada
- `Administrador Geral`: visualiza todas as unidades, usa filtros globais e acessa módulos administrativos

## Módulos Implementados

## Chamados Operacionais

Fluxo principal:

- `Aguardando`
- `Em atendimento`
- `Finalizado`

Rastreabilidade disponível:

- `criado_em`
- `assumido_em`
- `a_caminho_em`
- `cheguei_em`
- `iniciado_em`
- `finalizado_em`
- `cancelado_em`
- `empilhadeira_id`
- `empilhadeira_identificacao`

Métricas de tempo já suportadas:

- tempo para assumir
- tempo até sair a caminho
- tempo até chegar
- tempo de atendimento
- tempo total do chamado

## Televendas

O fluxo de televendas foi separado do fluxo operacional comum.

Status suportados:

- `Aberto`
- `Em separação`
- `Incompleto`
- `Pronto`
- `Finalizado`
- `Cancelado`

Recursos implementados:

- formulário específico para televendas
- lista estruturada de itens
- cálculo automático de quantidade faltante
- cálculo de totais e percentual atendido
- marcação de pedido incompleto
- observação do operador
- visualização de faltas no painel

Estrutura de item:

```ts
{
  produto: string;
  quantidadeSolicitada: number;
  quantidadeEncontrada: number;
  quantidadeFaltante: number;
}
```

Campos adicionais já suportados no documento:

- `itens`
- `total_solicitado`
- `total_encontrado`
- `percentual_atendido`
- `motivo_incompleto`
- `observacao_operador`
- `atualizado_em`
- `atualizado_por`

## Empilhadeiras

O módulo de empilhadeiras já está adaptado ao modelo multiunidade.

Entidade `empilhadeiras`:

- `id`
- `empresa_id`
- `supermercado_id`
- `identificacao`
- `modelo`
- `numero_interno`
- `status`
- `observacoes`
- `criado_em`
- `atualizado_em`

Status operacionais suportados:

- `Disponível`
- `Em uso`
- `Em manutenção`
- `Inativa`
- `Necessita atenção`
- `Reserva`

Recursos implementados:

- cadastro de empilhadeiras
- edição de dados
- alteração de status
- filtro automático por unidade
- vínculo opcional ao chamado
- bloqueio de uso fora da unidade correta
- histórico técnico por máquina
- painel técnico com indicadores por unidade

## Checklist Diário de Empilhadeira

Entidade `checklists_empilhadeira`:

- `id`
- `supermercado_id`
- `empilhadeira_id`
- `operador_id`
- `operador_nome`
- `data`
- `bateria_ok`
- `garfo_ok`
- `pneus_ok`
- `freio_ok`
- `sem_avaria`
- `observacoes`
- `criado_em`

Campos técnicos adicionais do fluxo:

- `reprovado`
- `itens_reprovados`
- `ocorrencia_tecnica`
- `tratado_em`
- `tratado_por`

Comportamento atual:

- checklist é preenchido antes do turno
- operador só pode registrar checklist da própria unidade
- checklist reprovado sinaliza a máquina como `Necessita atenção`
- o resultado aparece no histórico técnico da empilhadeira

## Falhas e Manutenções

Entidade `manutencoes`:

- `id`
- `supermercado_id`
- `empilhadeira_id`
- `tipo`
- `descricao`
- `prioridade`
- `status`
- `responsavel`
- `data_abertura`
- `data_prevista`
- `data_conclusao`
- `criado_por`
- `observacoes`

Tipos suportados:

- `Preventiva`
- `Corretiva`
- `Inspecao`
- `Revisao`
- `Bateria`

Prioridades suportadas:

- `Baixa`
- `Media`
- `Alta`
- `Critica`

Status suportados:

- `Aberta`
- `Em andamento`
- `Concluida`
- `Cancelada`

Recursos implementados:

- abertura manual de manutenção
- edição de manutenção
- alteração rápida de status
- filtro por unidade, empilhadeira, tipo, prioridade e status
- ação rápida de `Reportar problema` no painel do operador
- criação automática de manutenção corretiva a partir da operação
- histórico técnico vinculado à máquina

## Status Automático das Empilhadeiras

O status efetivo da máquina já considera múltiplas fontes:

- status manual base da empilhadeira
- uso operacional em chamado ativo
- checklist reprovado
- manutenção em andamento

Regras já aplicadas:

- empilhadeira em chamado ativo pode aparecer como `Em uso`
- checklist reprovado força `Necessita atenção`
- manutenção em andamento força `Em manutenção`
- empilhadeiras indisponíveis não podem ser selecionadas em chamados

## Telas Principais

### Login e Cadastro

- login por e-mail e senha
- login com Google
- criação de conta com nome, perfil e unidade
- auto-cadastro permitido somente para perfis operacionais (`Promotor`, `Funcionário`, `Operador`, `Supervisor`, `Televendas`)
- perfil administrativo não pode mais ser autoatribuído no cadastro público
- modal e landing harmonizados visualmente
- mostrar/ocultar senha no login e cadastro

### Convites de Admin da Empresa

Fluxo implementado para onboarding seguro de cliente:

- geração de token de convite no módulo `Usuários` (Admin Geral)
- convite com expiração (1, 3, 7, 15 ou 30 dias)
- validação de token no cadastro
- criação de conta como `Administrador da Empresa` vinculada à empresa do convite
- consumo de token com uso único
- bloqueio em regra para impedir auto-cadastro admin sem convite válido

### Assinaturas SaaS — Etapa 5.1

O gerenciamento SaaS foi adaptado para o plano Firebase Spark: as operações administrativas do painel Web usam transações do Firestore, autorizadas e validadas pelas regras. O fluxo não usa Cloud Functions em produção, não processa pagamentos e não bloqueia empresas por vencimento.

Estrutura de dados:

- `planos/{planoId}`: catálogo de planos, com preços em centavos e ciclos mensal, trimestral, semestral ou anual
- `empresas/{empresaId}/assinaturas/atual`: assinatura canônica única da empresa, sem duplicação por filial
- `empresas/{empresaId}/historico_assinatura/{operationId}`: eventos imutáveis de vínculo, ativação e renovação
- `auditoria_assinaturas/{operationId}`: auditoria de criação e edição de planos
- `assinatura_operacoes/{operationId}`: registro de idempotência para repetição segura das operações

Permissões e comportamento:

- somente `Administrador Geral` com status exatamente `Ativo` pode criar/editar planos, vincular planos e ativar ou renovar assinaturas
- `Administrador da Empresa` ativo pode ler somente a assinatura e o histórico da própria empresa
- clientes e usuários comuns não podem alterar planos, assinaturas, histórico ou auditoria SaaS
- cada operação grava o estado, histórico e registro de idempotência de forma atômica
- ativação e renovação são manuais; atribuir um plano não ativa a assinatura
- empresas sem assinatura continuam no fluxo legado; não há migração automática
- a interface SaaS e as novas regras ainda precisam de revisão/publicação autorizada para funcionarem em produção

### Painel do Operador

- fila por unidade
- ações de assumir, iniciar, finalizar e fluxo televendas
- seleção de empilhadeira da mesma unidade
- checklist antes do turno
- ação rápida para reportar problema técnico

### Dashboard

- dashboard da unidade para supervisão
- dashboard consolidado para administrador geral
- comparativo entre supermercados
- indicadores operacionais
- métricas de tempo por etapa

### Supermercados

- cadastro de unidades
- edição de dados
- ativação e inativação

### Usuários

- alteração de perfil
- alteração de unidade
- inativação e reativação
- geração e acompanhamento de convites para `Administrador da Empresa`

### Empilhadeiras

- cadastro e edição
- controle de status
- checklist recente
- manutenção recente
- histórico técnico por máquina
- indicadores por unidade

### Manutenções

- listagem completa
- nova manutenção
- edição
- alteração de status
- filtros técnicos por recorte

## Controle de Acesso e Isolamento

O projeto foi desenhado para não misturar operação entre supermercados.

Regras já aplicadas no app e refletidas nas coleções:

- usuários comuns, operadores e supervisores atuam apenas na própria unidade
- administrador da empresa atua apenas no recorte da própria empresa
- administrador geral pode visualizar todas as unidades com filtro
- nenhum chamado deve usar empilhadeira de unidade diferente
- checklist, manutenção, histórico e uso operacional respeitam `supermercado_id`
- relatórios e dashboards usam o mesmo recorte da unidade ativa
- criação de usuário admin por auto-cadastro público foi bloqueada por regra

## Tecnologias

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Firebase Auth
- Cloud Firestore

O fluxo SaaS de produção é compatível com Firebase Spark e não depende de Cloud Functions. O código callable legado em `functions/` permanece separado do fluxo Web atual.

## Estrutura do Projeto

```text
src/
  components/
  config/
  data/
  hooks/
  types/
  utils/
scripts/
  firebase/
firestore.rules
firebase.json
```

Arquivos centrais:

- `src/App.tsx`
- `src/components/OperadorPanel.tsx`
- `src/components/ChamadoForm.tsx`
- `src/components/EmpilhadeirasAdmin.tsx`
- `src/components/ManutencoesAdmin.tsx`
- `src/components/AssinaturasAdmin.tsx`
- `src/hooks/`
- `src/services/subscriptions.ts`
- `src/utils/subscriptionOperationId.ts`
- `src/utils/subscriptionErrors.ts`
- `firestore.rules`

## Requisitos

- Node.js 20+ recomendado
- npm
- projeto Firebase configurado

## Execução Local

### Instalação

```bash
npm install
```

### Variáveis de ambiente

Crie um `.env` com base em `.env.example`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Para desenvolver conectado exclusivamente aos emuladores, copie `.env.emulator.example` para `.env.emulator`. O modo Emulator exige um ID de projeto com prefixo `demo-` e rejeita outra configuração.

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview local

```bash
npm run preview
```

### Firebase Emulator

Inicie Auth e Firestore localmente em um terminal:

```bash
firebase emulators:start --config firebase.emulator.local.json --only auth,firestore --project demo-patio-pro-log
```

Em outro terminal, inicie o Web conectado a esses emuladores:

```bash
npm run dev:emulator
```

O modo local usa Auth Emulator em `127.0.0.1:19099` e Firestore Emulator em `127.0.0.1:18080`. Não use credenciais ou dados reais nesse ambiente.

### Testes e validação

```bash
npm test
npm run test:rules
npx tsc --noEmit
npm run build
```

`npm run test:rules` inicia temporariamente o Firestore Emulator no projeto fictício `demo-patio-pro-log` e executa testes de regras, autorização SaaS, isolamento, autoelevação e idempotência concorrente. O comando não publica regras nem acessa produção.

## Scripts Firebase

Scripts disponíveis:

```bash
npm run auth:set-claims
npm run auth:create-token
npm run auth:approve-user
npm run auth:check-access
```

Exemplo de diagnóstico de acesso:

```bash
npm run auth:check-access -- \
  --uid "UID_DO_USUARIO" \
  --chamado-id "ID_DO_CHAMADO" \
  --service-account "/caminho/serviceAccountKey.json"
```

## Estado Atual

Base já funcional para:

- autenticação
- multiempresa e multiunidade
- gestão de empresas (Admin Geral)
- gestão de supermercados
- gestão de usuários
- convite de administrador da empresa por token
- chamados operacionais
- televendas com itens e pedido incompleto
- painel do operador
- dashboards gerenciais
- empilhadeiras multiunidade
- checklist diário
- falhas operacionais
- manutenções
- histórico técnico por máquina
- planos e assinaturas SaaS manuais com auditoria e idempotência

## Pendências Conhecidas

- comparar e revisar as regras locais com a cópia atualmente publicada antes de qualquer publicação
- realizar validação visual e operacional no ambiente publicado após autorização de implantação
- ampliar a suíte de testes para cadastro por convite, início de atendimento com empilhadeira e checklist antes do turno
- revisar a exposição pública dos documentos de `empresas` e `supermercados` antes do login
- documentar os procedimentos operacionais para `Administrador da Empresa`, `Supervisor` e `Operador`

## Próximos Passos Recomendados

- adicionar relatórios técnicos exportáveis por empilhadeira e unidade
- consolidar indicadores de manutenção e checklist no dashboard executivo
- criar suíte de testes de integração para fluxos com Firestore Rules
- revisar documentação de operação para usuários finais

## Licença

Uso interno do projeto.
