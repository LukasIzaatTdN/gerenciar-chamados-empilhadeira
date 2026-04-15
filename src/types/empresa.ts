export type EmpresaStatus = "Ativa" | "Inativa";
export type PlanoStatus = "Ativo" | "Teste" | "Suspenso" | "Cancelado";
export type PlanoCiclo = "Mensal" | "Trimestral" | "Semestral" | "Anual";

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
