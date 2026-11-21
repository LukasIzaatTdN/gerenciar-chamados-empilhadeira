# Patch revisado de televendas — WIP

NÃO FAZER MERGE OU DEPLOY. O arquivo pedidos-televendas-revisado-wip.patch.gz.base64 é o patch revisado comprimido em gzip e codificado em base64, baseado no commit 16e1ae2. Ele substitui o patch anterior como material de trabalho, mas NÃO está aplicado aos arquivos ativos da branch.

Para retomar em cópia de trabalho limpa, decodificar base64, descomprimir gzip e verificar a aplicação do patch antes de aplicá-lo. O patch inclui documentação dos resultados e bloqueios de segurança. Em teste local passou a criação isolada e os testes de regras e build descritos no patch, mas falta verificar o batch real com auditoria, updates, segurança dos perfis, interface, índice e TypeScript. Existem riscos conhecidos de acesso e de exibição de quantidades, documentados no patch. Não usar em produção.
