# Painel Empilhadeira

Aplicação web para gerenciar chamados, pedidos de televendas e empilhadeiras em operações com empresas e unidades.

## Funcionalidades

- Autenticação e acesso por perfil, empresa e unidade.
- Chamados operacionais com fila, prioridade e acompanhamento das etapas.
- Pedidos de televendas com itens, quantidades e status de separação.
- Cadastro de empilhadeiras, checklist, registro de falhas e manutenções.
- Painéis com indicadores, tempos de atendimento e comparativos entre unidades.
- Administração de empresas, unidades e usuários, além de planos e assinaturas gerenciados manualmente.
- Estrutura para notificações push web, sujeita a configuração e publicação separadas.

## Tecnologias

React, TypeScript, Vite, Tailwind CSS, Firebase Authentication e Cloud Firestore.

## Como executar

Requisitos: Node.js 22.12 ou superior, npm e um projeto Firebase configurado.

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env` e preencha as configurações do Firebase. Não publique credenciais ou arquivos de ambiente privados.
3. Inicie o projeto:

   ```bash
   npm run dev
   ```

## Comandos úteis

```bash
npm test             # testes unitários
npm run test:rules   # testes de regras no emulador do Firestore
npm run build        # gerar versão de produção
npm run preview      # visualizar o build localmente
```

Os testes de regras exigem Firebase CLI e Java. Use apenas dados fictícios nos emuladores.

## Atenção

O código da branch `main` não confirma, por si só, o que está publicado. Revise as regras de acesso e execute os testes antes de publicar alterações. As melhorias de pedidos próprios e conferência em desenvolvimento não fazem parte desta documentação da `main`.

## Licença

Uso interno do projeto.
