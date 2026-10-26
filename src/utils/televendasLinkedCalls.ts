import type { Chamado } from "../types/chamado.ts";

export type LinkedCallProgress =
  | "Aguardando"
  | "Assumido"
  | "A caminho"
  | "Cheguei"
  | "Em atendimento"
  | "Finalizado"
  | "Cancelado";

export function getLinkedCallsForItem(
  chamados: Chamado[],
  pedido: Pick<Chamado, "id" | "empresa_id" | "supermercado_id">,
  itemIndex: number
) {
  return chamados
    .filter((chamado) =>
      chamado.categoria === "operacional" &&
      chamado.pedido_origem_id === pedido.id &&
      chamado.pedido_origem_item_index === itemIndex &&
      chamado.empresa_id === pedido.empresa_id &&
      chamado.supermercado_id === pedido.supermercado_id
    )
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export function getLinkedCallProgress(chamado: Chamado): LinkedCallProgress {
  if (chamado.status === "Cancelado" || chamado.cancelado_em) return "Cancelado";
  if (chamado.status === "Finalizado" || chamado.finalizado_em) return "Finalizado";
  if (chamado.status === "Em atendimento" || chamado.iniciado_em) return "Em atendimento";
  if (chamado.cheguei_em) return "Cheguei";
  if (chamado.a_caminho_em) return "A caminho";
  if (chamado.assumido_em || chamado.operador_nome) return "Assumido";
  return "Aguardando";
}
