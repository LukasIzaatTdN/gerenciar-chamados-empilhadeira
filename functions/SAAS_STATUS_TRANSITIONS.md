# Transições de status de assinaturas SaaS

Para o plano Firebase Spark, o painel Web grava diretamente por transações Firestore. As regras SaaS autorizam apenas o Administrador Geral com status exatamente `Ativo` e exigem os documentos de assinatura/histórico/ledger na mesma operação. O backend callable antigo permanece apenas para testes locais e não faz parte do fluxo Web nem do plano de publicação Spark.

| Operação | Estado atual | Resultado | Regra |
| --- | --- | --- | --- |
| Vincular plano | Sem assinatura | Pendente | Permitido |
| Vincular/trocar plano | Pendente, Ativa ou Expirada | Mantém o estado | Permitido; não ativa nem prorroga |
| Ativar | Pendente | Ativa | Permitido; inicia o ciclo na data atual |
| Renovar | Ativa | Ativa | Permitido; prorroga da data futura de vencimento ou da data atual |
| Renovar | Expirada | Ativa | Permitido por renovação manual explícita; não liga bloqueio automático |

Estados desconhecidos são rejeitados. Ativar uma assinatura já Ativa, renovar uma Pendente e qualquer ativação/renovação a partir de Suspensa ou Cancelada são rejeitados.

Suspensa → Ativa (reativação), Cancelada → Ativa (reativação), renovação de Suspensa/Cancelada e renovação de Pendente ainda exigem decisão de produto. Também é bloqueada a troca de plano quando a assinatura está Suspensa ou Cancelada até essa decisão. Esses casos não são inferidos pela função.

O plano aceita somente status `Ativo` e `Inativo`; qualquer outro valor é erro de validação.
