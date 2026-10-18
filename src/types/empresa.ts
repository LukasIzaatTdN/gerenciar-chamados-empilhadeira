export type EmpresaStatus = "Ativa" | "Inativa";
export type PlanoStatus = "Ativo" | "Teste" | "Suspenso" | "Cancelado";
export type PlanoCiclo = "Mensal" | "Trimestral" | "Semestral" | "Anual";

export type PlanoComercialStatus = "Ativo" | "Inativo";
export type AssinaturaStatus = "Pendente" | "Ativa" | "Suspensa" | "Cancelada" | "Expirada";
export type AssinaturaCiclo = PlanoCiclo;
export type FirestoreDateValue = string | { toDate(): Date };

/** Global commercial plan catalog. Monetary values are integer cents (BRL). */
export interface PlanoComercial {
  id: string;
  nome: string;
  descricao: string;
  valor_centavos: number;
  ciclo: AssinaturaCiclo;
  limite_usuarios: number | null;
  limite_filiais: number | null;
  status: PlanoComercialStatus;
  criado_em: FirestoreDateValue;
  atualizado_em: FirestoreDateValue;
}

/** One canonical subscription document per company; branch count never duplicates it. */
export interface AssinaturaEmpresa {
  empresa_id: string;
  plano_id: string;
  plano_nome: string;
  status: AssinaturaStatus;
  ciclo: AssinaturaCiclo;
  valor_centavos: number;
  inicio_em: FirestoreDateValue | null;
  vence_em: FirestoreDateValue | null;
  renovacao_manual: true;
  cobranca_automatica: false;
  provedor_pagamento: null;
  criado_em: FirestoreDateValue;
  atualizado_em: FirestoreDateValue;
  atualizado_por: string;
}

export interface EventoAssinatura {
  id: string;
  acao: "plano_vinculado" | "assinatura_ativada" | "assinatura_renovada" | "plano_criado" | "plano_editado";
  empresa_id?: string;
  plano_id: string;
  ator_uid: string;
  ator_nome: string;
  ocorrido_em: FirestoreDateValue;
  detalhes: Record<string, unknown>;
}

export interface Empresa {
  id: string;
  nome: string;
  codigo: string;
  cnpj?: string | null;
  status: EmpresaStatus;
  plano_codigo: string;
  plano_nome: string;
  plano_status: PlanoStatus;
  plano_ciclo: PlanoCiclo;
  max_usuarios: number | null;
  max_unidades: number | null;
  contrato_inicio?: string | null;
  contrato_fim?: string | null;
  criado_em: string;
}
