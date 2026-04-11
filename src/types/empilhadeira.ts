export type EmpilhadeiraStatus =
  | "Disponível"
  | "Em uso"
  | "Em manutenção"
  | "Inativa"
  | "Necessita atenção"
  | "Reserva";

export interface Empilhadeira {
  id: string;
  empresa_id: string;
  supermercado_id: string;
  identificacao: string;
  modelo: string;
  numero_interno: string;
  status: EmpilhadeiraStatus;
  observacoes: string;
  criado_em: string;
  atualizado_em: string;
}

export const EMPILHADEIRA_STATUS_OPTIONS: EmpilhadeiraStatus[] = [
  "Disponível",
  "Em uso",
  "Em manutenção",
  "Inativa",
  "Necessita atenção",
  "Reserva",
];

export function isEmpilhadeiraSelecionavelParaChamado(status: EmpilhadeiraStatus): boolean {
  return status === "Disponível";
}

export function isEmpilhadeiraCompativelComChamado(status: EmpilhadeiraStatus): boolean {
  return status === "Disponível" || status === "Em uso" || status === "Reserva";
}
