export type ManutencaoTipo =
  | "Preventiva"
  | "Corretiva"
  | "Inspecao"
  | "Revisao"
  | "Bateria";

export type ManutencaoPrioridade = "Baixa" | "Media" | "Alta" | "Critica";

export type ManutencaoStatus = "Aberta" | "Em andamento" | "Concluida" | "Cancelada";

export interface Manutencao {
  id: string;
  empresa_id: string;
  supermercado_id: string;
  empilhadeira_id: string;
  tipo: ManutencaoTipo;
  descricao: string;
  prioridade: ManutencaoPrioridade;
  status: ManutencaoStatus;
  responsavel: string | null;
  data_abertura: string;
  data_prevista: string | null;
  data_conclusao: string | null;
  criado_por: string;
  observacoes: string | null;
}

export interface NovaManutencaoInput {
  empresa_id: string;
  supermercado_id: string;
  empilhadeira_id: string;
  tipo: ManutencaoTipo;
  descricao: string;
  prioridade: ManutencaoPrioridade;
  status: ManutencaoStatus;
  responsavel?: string | null;
  data_abertura: string;
  data_prevista?: string | null;
  data_conclusao?: string | null;
  criado_por: string;
  observacoes?: string | null;
}

export const MANUTENCAO_TIPO_OPTIONS: ManutencaoTipo[] = [
  "Preventiva",
  "Corretiva",
  "Inspecao",
  "Revisao",
  "Bateria",
];

export const MANUTENCAO_PRIORIDADE_OPTIONS: ManutencaoPrioridade[] = [
  "Baixa",
  "Media",
  "Alta",
  "Critica",
];

export const MANUTENCAO_STATUS_OPTIONS: ManutencaoStatus[] = [
  "Aberta",
  "Em andamento",
  "Concluida",
  "Cancelada",
];
