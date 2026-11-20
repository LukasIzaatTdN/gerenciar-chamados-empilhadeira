# Correções de segurança: proposta para revisão

**Rascunho. Não implantar nem mesclar sem concluir a revisão e os testes.**

Esta proposta restringe o autocadastro, exige status ativo em permissões, delimita o acesso aos escalonamentos e protege o resgate atômico de convites. O cadastro comum passa a ficar pendente até aprovação; convites novos usam tokens criptográficos. A interface e os índices foram adaptados em conjunto.

## Validação realizada

- Build Vite e 22 testes unitários passaram antes dos últimos ajustes nas regras e testes.
- No emulador, os 19 testes específicos de escopo e convites e 7 testes de regras SaaS passaram após os ajustes. Uma execução completa não foi concluída: a suíte de regras de assinatura ultrapassou 40 segundos e o teste de cliente de assinaturas travou e foi interrompido. Investigar também mensagens de limite de 1.000 expressões em operações negadas de usuários e empilhadeiras.
- A verificação TypeScript relatou oito erros em arquivos preexistentes de interface. Não se confirmou aqui que o projeto principal está livre desses erros.
- Não foram verificados regras implantadas, índices em produção, autenticação real ou fluxos completos de usuário. Não houve deploy.

## Pendências obrigatórias antes de implantar

- Revisar as permissões para criação e resolução de escalonamentos: a validação de perfil e de dados reais ainda deve ser reforçada. Empresas e unidades ainda podem expor dados publicamente pelas regras já existentes; separar um catálogo mínimo de cadastro.
- A troca de unidade pelo próprio usuário foi desabilitada, inclusive para perfis com múltiplas unidades. Planejar um fluxo seguro que respeite a lista de unidades autorizadas.
- Migrar cuidadosamente usuários legados sem status e escalonamentos antigos sem empresaId, após conferir seus vínculos. Criar e aguardar os índices; coordenar cliente, regras, índices e migração.
- Revogar e substituir convites antigos potencialmente previsíveis. O token é uma credencial: protegê-lo e revisar acesso a convites legados.
- Planejar recuperação de contas Auth criadas sem perfil Firestore, inclusive quando o resultado de uma transação for incerto. Verificar fluxos de autenticação, cadastro secundário e reconciliação.
- Rever tratamento e repetição de falhas de sincronização dos escalonamentos. Concluir a suíte de testes e revisar os limites de expressões. Testar migrações e fluxos reais antes de qualquer publicação.
