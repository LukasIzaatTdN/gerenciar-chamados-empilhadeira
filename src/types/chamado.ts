export type Setor = string;

export type TipoServico = "Descarga" | "Reposição" | "Retirada" | "Movimentação";

export type Prioridade = "Normal" | "Urgente";

export type Status = "Aguardando" | "Em atendimento" | "Finalizado";

export interface Chamado {
  id: string;
  supermercado_id: string;
  solicitante_nome: string;
  setor: Setor;
  tipo_servico: TipoServico;
  prioridade: Prioridade;
  status: Status;
  operador_nome: string | null;
  criado_em: string;
  assumido_em: string | null;
  a_caminho_em: string | null;
  cheguei_em: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  cancelado_em: string | null;
}

export const TIPOS_SERVICO: TipoServico[] = [
  "Descarga",
  "Reposição",
  "Retirada",
  "Movimentação",
];

export const PRIORIDADES: Prioridade[] = ["Normal", "Urgente"];
