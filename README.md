# Gerenciar Chamados de Empilhadeira

Sistema web para gerenciamento de chamados operacionais de empilhadeira, com operação multiunidade, controle por usuário e sincronização com Firebase.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Firebase Firestore
- Firebase Auth

## Status Atual

### Já implementado

- Modelo multiunidade com entidade `supermercados`
- Chamados vinculados por `supermercado_id`
- Chamados com rastreamento por etapa:
  - `criado_em`, `assumido_em`, `a_caminho_em`, `cheguei_em`, `iniciado_em`, `finalizado_em`, `cancelado_em`
- Métricas automáticas por etapa:
  - tempo para assumir
  - tempo até sair a caminho
  - tempo até chegar
  - tempo de atendimento
  - tempo total do chamado
- Escopo por unidade em filas, painel, dashboard e métricas
- Perfis:
  - `Promotor`, `Funcionário`, `Operador`, `Supervisor`, `Televendas`, `Administrador Geral`
- Novo tipo de serviço suportado:
  - `Atendimento Televendas`
- Isolamento de dados por unidade no frontend e nas regras do Firestore
- Dashboard separado do painel do operador
- Dashboard executivo do Administrador Geral com:
  - visão consolidada das unidades
  - filtro por período (`hoje`, `7 dias`, `30 dias`)
  - resumo executivo com alertas de fila e urgência
  - comparativo e ranking entre supermercados
- Painel do operador dedicado à operação da unidade
- Tela administrativa de supermercados para `Administrador Geral`
- Seletor global de unidade para `Administrador Geral`
- Login responsivo com:
  - login local por perfil + nome + unidade
  - Firebase Auth com e-mail/senha
  - login com Google
  - criação de conta com nome, perfil e unidade
- Sessão persistida:
  - localStorage no modo local
  - Firebase Auth no modo Firebase
- Troca de unidade disponível no perfil
- Navegação com retorno para a tela anterior
- UX refinada entre perfis
- Firestore com coleções reais:
  - `chamados`
  - `supermercados`
  - `usuarios`
- Gestão administrativa de usuários:
  - listar usuários
  - alterar perfil/unidade
  - bloquear/inativar e reativar usuário
- Regras do Firestore versionadas no projeto:
  - arquivo `firestore.rules`
  - mapeamento em `firebase.json`
- Regras operacionais atuais:
  - chamados dependem de unidade correta e usuário autenticado
  - etapa operacional não depende mais de perfil
  - perfil `Televendas` pode abrir e acompanhar os próprios chamados da unidade
- Suporte a custom claims administrativas (`perfil`, `supermercado_id`)
- Tratamento defensivo de runtime:
  - normalização de chamados/remotos
  - sanitização de notificações salvas
  - `ErrorBoundary` para evitar tela branca total
- Estabilidade mobile reforçada no painel do operador:
  - bloqueio de ações concorrentes (toque duplo) ao assumir/iniciar/finalizar
  - proteção local da lista de chamados com `SectionErrorBoundary`
  - mitigação de erros de renderização intermitentes no Android
- Hidratação de sessão no refresh:
  - tela de carregamento de autenticação antes de renderizar a experiência principal
  - evita “flash” de tela de acesso restrito durante restauração da sessão Firebase
- Normalização de identificação do operador no painel:
  - comparação tolerante de nome (acento/maiúsculas/espaços)
  - correção de contagem em “Meus Chamados”
- Badge visual com projeto Firebase ativo no header
- Script de diagnóstico de acesso para operador/chamado

## Regras de Negócio Principais

- Todo chamado pertence a um supermercado.
- Usuários comuns operam somente na própria unidade.
- Usuários autenticados da mesma unidade podem assumir, iniciar e finalizar chamados.
- Supervisor visualiza dashboard/fila/relatórios da unidade dele.
- Administrador geral pode visualizar todas as unidades.

## Estrutura Relevante

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
- `src/components/AdminExecutiveSummary.tsx`
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

## Como Rodar

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

## Scripts Úteis

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

## Deploy de Regras do Firestore

```bash
firebase deploy --only firestore:rules --project painel-772bf
```

## Validação

```bash
npx tsc --noEmit
```
