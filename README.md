# Painel Empilhadeira

Aplicação web para gerenciamento de chamados de empilhadeira em operação multiunidade, com controle por perfil, sincronização com Firebase e suporte a fluxos operacionais e de televendas.

O projeto foi desenhado para atender supermercados ou centros de distribuição que precisam organizar solicitações internas com visibilidade por loja, painel operacional para operadores, dashboard gerencial e rastreabilidade completa do atendimento.

## Visão Geral

O sistema permite:

- abrir chamados operacionais por unidade
- acompanhar a fila de atendimento em tempo real
- operar chamados em painel dedicado para operador
- separar visualmente chamados de televendas e chamados operacionais
- consolidar indicadores por supermercado
- gerenciar usuários e supermercados em ambiente administrativo
- manter isolamento de dados por unidade

## Principais Funcionalidades

### Multiunidade

- entidade `supermercados`
- vínculo de usuários por `supermercado_id`
- vínculo de chamados por `supermercado_id`
- leitura segmentada por unidade em filas, dashboards e operação
- visão consolidada apenas para `Administrador Geral`

### Perfis de Acesso

Perfis atualmente suportados:

- `Promotor`
- `Funcionário`
- `Operador`
- `Supervisor`
- `Televendas`
- `Administrador Geral`

Resumo do comportamento por perfil:

- `Promotor` e `Funcionário`: abrem chamados e acompanham os próprios chamados da unidade
- `Operador`: atua no painel operacional da unidade e executa o fluxo do atendimento
- `Supervisor`: acompanha dashboard e operação da unidade
- `Televendas`: abre pedidos internos com estrutura própria de itens
- `Administrador Geral`: visualiza todas as unidades e acessa a gestão administrativa

### Chamados Operacionais

Fluxo principal:

- `Aguardando`
- `Em atendimento`
- `Finalizado`

Campos rastreados:

- `criado_em`
- `assumido_em`
- `a_caminho_em`
- `cheguei_em`
- `iniciado_em`
- `finalizado_em`
- `cancelado_em`

Métricas calculadas:

- tempo para assumir
- tempo até sair a caminho
- tempo até chegar
- tempo de atendimento
- tempo total do chamado

### Chamados de Televendas

O módulo de televendas foi separado do fluxo operacional comum para permitir melhor organização dos pedidos.

Status suportados atualmente:

- `Aberto`
- `Em separação`
- `Incompleto`
- `Pronto`
- `Finalizado`
- `Cancelado`

Recursos implementados:

- formulário específico para televendas
- estrutura por lista de itens
- cálculo automático de faltas
- cálculo de totais e percentual atendido
- atualização do pedido pelo operador
- destaque visual para pedidos incompletos
- resumo de itens faltantes no card

Estrutura de item de televendas:

```ts
{
  produto: string
  quantidadeSolicitada: number
  quantidadeEncontrada: number
  quantidadeFaltante: number
}
```

Campos adicionais suportados no pedido:

- `itens`
- `total_solicitado`
- `total_encontrado`
- `percentual_atendido`
- `motivo_incompleto`
- `observacao_operador`
- `atualizado_em`
- `atualizado_por`

## Experiência por Tela

### Login e Conta

- login responsivo para desktop e mobile
- suporte a modo local e Firebase Auth
- login por e-mail e senha
- login com Google
- criação de conta com nome, perfil e unidade
- administrador geral pode criar conta sem unidade vinculada

### Painel do Operador

- painel dedicado por unidade
- fila filtrada por supermercado
- cards com estado visual por prioridade e status
- conferência de itens de televendas direto no card
- ações operacionais e de televendas sem misturar os fluxos

### Dashboard

- dashboard por unidade para supervisão
- dashboard executivo consolidado para administrador geral
- comparativo entre supermercados
- indicadores operacionais, urgências e tempo médio

### Administração

- gestão de supermercados
- gestão de usuários
- alteração de perfil e unidade
- bloqueio e reativação de usuários

## Stack Técnica

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Firebase Auth
- Firestore

## Estrutura do Projeto

```text
src/
  components/
  config/
  data/
  hooks/
  services/
  types/
  utils/
scripts/
  firebase/
firestore.rules
firebase.json
```

Arquivos mais relevantes:

- [`src/App.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/App.tsx)
- [`src/components/ChamadoForm.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/ChamadoForm.tsx)
- [`src/components/ChamadoList.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/ChamadoList.tsx)
- [`src/components/ChamadoCard.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/ChamadoCard.tsx)
- [`src/components/OperadorPanel.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/OperadorPanel.tsx)
- [`src/components/OperadorLogin.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/OperadorLogin.tsx)
- [`src/components/SupermercadosAdmin.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/SupermercadosAdmin.tsx)
- [`src/components/UsuariosAdmin.tsx`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/components/UsuariosAdmin.tsx)
- [`src/hooks/useChamados.ts`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/hooks/useChamados.ts)
- [`src/hooks/useSupermercados.ts`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/hooks/useSupermercados.ts)
- [`src/hooks/useUsuarios.ts`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/hooks/useUsuarios.ts)
- [`src/utils/televendasItems.ts`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/utils/televendasItems.ts)
- [`src/utils/chamadoStatus.ts`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/src/utils/chamadoStatus.ts)
- [`firestore.rules`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/firestore.rules)

## Requisitos

- Node.js 20+ recomendado
- npm
- projeto Firebase configurado

## Como Executar

### 1. Instalação

```bash
npm install
```

### 2. Configuração de ambiente

Crie um `.env` com base em `.env.example`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 3. Ambiente de desenvolvimento

```bash
npm run dev
```

### 4. Build de produção

```bash
npm run build
```

### 5. Preview local

```bash
npm run preview
```

## Scripts Administrativos

Scripts disponíveis:

```bash
npm run auth:set-claims
npm run auth:create-token
npm run auth:approve-user
npm run auth:check-access
```

Esses scripts usam `firebase-admin` na pasta `scripts/firebase`.

Exemplo de diagnóstico:

```bash
npm run auth:check-access -- \
  --uid "UID_DO_USUARIO" \
  --chamado-id "ID_DO_CHAMADO" \
  --service-account "/caminho/serviceAccountKey.json"
```

## Regras do Firestore

As regras estão versionadas em:

- [`firestore.rules`](/home/lucas/Área%20de%20trabalho/Projetos%20vscode/gerenciar-chamados-empilhadeira/firestore.rules)

Deploy:

```bash
firebase deploy --only firestore:rules
```

## Validação Técnica

Verificação de tipos:

```bash
npx tsc --noEmit
```

Build:

```bash
npm run build
```

## Estado Atual do Projeto

O projeto já possui base funcional para:

- autenticação
- multiunidade
- gestão de usuários
- gestão de supermercados
- fila operacional
- painel do operador
- dashboards gerenciais
- fluxo específico de televendas
- pedido incompleto em televendas

## Próximos Passos Recomendados

- ampliar testes reais do fluxo `televendas -> operador -> incompleto -> finalizado`
- revisar relatórios históricos com foco em televendas
- adicionar testes automatizados para helpers e regras de fluxo
- revisar documentação operacional para usuários finais

## Licença

Uso interno do projeto.
