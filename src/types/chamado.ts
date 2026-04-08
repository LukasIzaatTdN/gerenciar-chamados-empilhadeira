export type Setor = string;
export type CategoriaChamado = "operacional" | "televendas";

export type TipoServico =
  | "Descarga"
  | "Reposição"
  | "Retirada"
  | "Movimentação"
  | "Apoio interno"
  | "Atendimento Televendas";

export type Prioridade = "Normal" | "Urgente";

export type Status =
  | "Aguardando"
  | "Em atendimento"
  | "Finalizado"
  | "Aberto"
  | "Em separação"
  | "Incompleto"
  | "Pronto"
  | "Cancelado";

export interface ItemTelevendas {
  produto: string;
  quantidadeSolicitada: number;
  quantidadeEncontrada: number;
  quantidadeFaltante: number;
}

export interface Chamado {
  id: string;
  categoria: CategoriaChamado;
  supermercado_id: string;
  solicitante_nome: string;
  setor: Setor;
  local_exato: string | null;
  tipo_servico: TipoServico;
  numero_pedido: string | null;
  cliente: string | null;
  produto: string | null;
  quantidade: string | null;
  itens: ItemTelevendas[];
  total_solicitado: number | null;
  total_encontrado: number | null;
  percentual_atendido: number | null;
  motivo_incompleto: string | null;
  observacao_operador: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  local_separacao: string | null;
  prazo_limite: string | null;
  prioridade: Prioridade;
  observacoes: string | null;
  foto_nome: string | null;
  foto_data_url: string | null;
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
  "Apoio interno",
  "Atendimento Televendas",
];

export const TIPOS_SERVICO_OPERACIONAIS: TipoServico[] = [
  "Descarga",
  "Reposição",
  "Retirada",
  "Movimentação",
  "Apoio interno",
];

export const PRIORIDADES: Prioridade[] = ["Normal", "Urgente"];
