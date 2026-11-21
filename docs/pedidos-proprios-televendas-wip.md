# Prévia de pedidos próprios de televendas

Esta branch contém somente um componente isolado e não conectado ao painel. Não está pronto para uso ou deploy.

Pendências obrigatórias: integrar ao painel com os tipos e consultas existentes; garantir no Firestore/backend que o vendedor possa ler somente os próprios pedidos pelo solicitante_uid, empresa e supermercado, sem usar nome como identificação; decidir tratamento seguro dos pedidos antigos sem UID; preservar acessos de separadores e demais perfis; testar regras no emulador, interface e build. O filtro da interface não é uma autorização. Não alterar a branch de segurança nem publicar automaticamente.
