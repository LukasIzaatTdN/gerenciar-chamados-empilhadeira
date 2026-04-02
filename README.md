# Gerenciar Chamados de Empilhadeira

Sistema web para gerenciamento de chamados operacionais de empilhadeira, com operação multiunidade (supermercados), controle por perfil e sincronização com Firebase.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Firebase Firestore
- Firebase Auth

## Status Atual

### Já implementado

- Modelo multiunidade com entidade `supermercados`:
  - `id`, `nome`, `codigo`, `endereco`, `status`, `criado_em`
- Chamados vinculados por `supermercado_id`
- Escopo por unidade em filas, painel, dashboard e métricas
- Perfis e permissões:
  - `Promotor`, `Funcionário`, `Operador`, `Supervisor`, `Administrador Geral`
- Isolamento de dados por unidade no frontend e nas regras do Firestore
- Dashboard separado do painel do operador (somente supervisor/admin)
- Painel do operador dedicado à operação da unidade
- Painel do operador com:
  - status do operador
  - pendentes da unidade
  - chamado recomendado
  - listas por aba (`pendentes`, `meus`, `finalizados`)
  - acesso direto a `Configurações`
- Tela administrativa de supermercados (admin geral):
  - listar, criar, editar, ativar/inativar
- Seletor global de unidade para administrador geral
- Login responsivo (desktop/mobile) com modal otimizado para telas menores
- Fluxo de autenticação:
  - sem Firebase: login local por perfil + nome + unidade
  - com Firebase: entrar por e-mail/senha, entrar com Google e criar conta (nome, perfil e unidade)
- Sessão persistida:
  - localStorage no modo local
  - Firebase Auth no modo Firebase
- Navegação com retorno para a tela anterior:
  - perfil/configurações
  - painel do operador
  - dashboard
  - telas administrativas
- Firestore com coleções reais:
  - `chamados`
  - `supermercados`
  - `usuarios`
- Gestão administrativa de usuários (Administrador Geral):
  - listar usuários
  - alterar perfil/unidade
  - bloquear/inativar e reativar usuário
- Regras do Firestore versionadas no projeto:
  - arquivo `firestore.rules`
  - mapeamento em `firebase.json`
- Regras operacionais atuais:
  - `Promotor` e `Funcionário` abrem chamados e acompanham apenas suas próprias solicitações
  - `Operador` assume, inicia e finaliza chamados somente da unidade vinculada
  - `Supervisor` acompanha fila, dashboard, histórico e relatórios da própria unidade, sem executar atendimento
  - `Administrador Geral` mantém visão total das unidades e autonomia administrativa
- Suporte a custom claims administrativas (`perfil`, `supermercado_id`) quando necessário
- Tratamento defensivo de runtime:
  - normalização de chamados/remotos
  - sanitização de notificações salvas
  - `ErrorBoundary` para evitar tela branca total
- Badge visual com projeto Firebase ativo no header
- Script de diagnóstico de acesso para operador/chamado

### Em andamento / faltando

- Endurecer regras para impedir autoelevação de perfil no cadastro público
- Adicionar testes automatizados (principalmente mobile e permissões)
- Revisar UX final do fluxo de chamados entre perfis em produção

## Regras de negócio principais

- Todo chamado pertence a um supermercado.
- Usuários comuns operam somente na própria unidade.
- Somente operadores atendem chamados da própria unidade.
- Supervisor visualiza dashboard/fila/relatórios da unidade dele.
- Administrador geral pode visualizar todas as unidades.

## Estrutura relevante

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

Arquivos-chave:

- `src/App.tsx`
- `src/components/OperadorLogin.tsx`
- `src/components/OperadorPanel.tsx`
- `src/components/SupermercadosAdmin.tsx`
- `src/components/UsuariosAdmin.tsx`
- `src/components/ProfileSettings.tsx`
- `src/components/AppErrorBoundary.tsx`
- `src/hooks/useChamados.ts`
- `src/hooks/useSupermercados.ts`
- `src/hooks/useUsuarios.ts`
- `src/hooks/useNotifications.ts`
- `src/config/firebase.ts`
- `firestore.rules`
- `firebase.json`

## Como rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar `.env`

Use o `.env.example` como base:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

### 4. Build

```bash
npm run build
```

## Scripts úteis

```bash
npm run auth:set-claims
npm run auth:create-token
npm run auth:approve-user
npm run auth:check-access
```

Esses scripts usam `firebase-admin` (pasta `scripts/firebase`) para operação administrativa de claims/token.

Observação importante:

- `--supermercado-id` é obrigatório em todos os scripts de claims/token
- para Administrador Geral, use `--supermercado-id all`

Exemplo de diagnóstico de acesso:

```bash
npm run auth:check-access -- \
  --uid "UID_DO_USUARIO" \
  --chamado-id "ID_DO_CHAMADO" \
  --service-account "/caminho/serviceAccountKey.json"
```

## Deploy de regras do Firestore

```bash
firebase deploy --only firestore:rules --project painel-772bf
```

## Validação

```bash
npx tsc --noEmit
```

Sem erros de TypeScript na última validação local.
