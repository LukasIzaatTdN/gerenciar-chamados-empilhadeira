export interface ChecklistEmpilhadeira {
  id: string;
  supermercado_id: string;
  empilhadeira_id: string;
  operador_id: string;
  operador_nome: string;
  data: string;
  bateria_ok: boolean;
  garfo_ok: boolean;
  pneus_ok: boolean;
  freio_ok: boolean;
  sem_avaria: boolean;
  reprovado: boolean;
  itens_reprovados: string[];
  ocorrencia_tecnica: string | null;
  observacoes: string | null;
  tratado_em: string | null;
  tratado_por: string | null;
  criado_em: string;
}

export interface NovoChecklistEmpilhadeiraInput {
  supermercado_id: string;
  empilhadeira_id: string;
  operador_id: string;
  operador_nome: string;
  data: string;
  bateria_ok: boolean;
  garfo_ok: boolean;
  pneus_ok: boolean;
  freio_ok: boolean;
  sem_avaria: boolean;
  observacoes?: string | null;
}
