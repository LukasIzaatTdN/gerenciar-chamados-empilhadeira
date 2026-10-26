import type { NovoChamadoInput } from "../hooks/useChamados.ts";
import type { Chamado, ItemTelevendas, TipoServico } from "../types/chamado.ts";
import { formatQuantidadeComUnidade } from "./televendasItems.ts";

export interface LinkedPalletRequest {
  pedido: Chamado;
  item: ItemTelevendas;
  itemIndex: number;
  quantidadeSolicitada: number;
  solicitanteNome: string;
  localizacaoPallet: string;
  tipoServico: Exclude<TipoServico, "Atendimento Televendas">;
  observacoes?: string;
}

export function buildLinkedPalletCallInput(request: LinkedPalletRequest): NovoChamadoInput {
  const { pedido, item, itemIndex } = request;
  const location = request.localizacaoPallet.trim();

  if (pedido.categoria !== "televendas" || pedido.status !== "Em separação") {
    throw new Error("Este pedido não está disponível para solicitar movimentação.");
  }
  if (!pedido.numero_pedido?.trim() || !pedido.empresa_id || !pedido.supermercado_id) {
    throw new Error("O pedido está sem número, empresa ou unidade definida.");
  }
  if (!item.produto.trim() || request.quantidadeSolicitada <= 0 || itemIndex < 0) {
    throw new Error("O item do pedido não possui produto ou quantidade válida.");
  }
  if (!location) {
    throw new Error("Informe a localização do pallet.");
  }

  return {
    empresa_id: pedido.empresa_id,
    supermercado_id: pedido.supermercado_id,
    categoria: "operacional",
    solicitante_nome: request.solicitanteNome,
    setor: pedido.setor || "Televendas",
    local_exato: location,
    tipo_servico: request.tipoServico,
    numero_pedido: pedido.numero_pedido.trim(),
    produto: item.produto.trim(),
    quantidade: formatQuantidadeComUnidade(request.quantidadeSolicitada, item.unidadeMedida),
    prioridade: "Normal",
    observacoes: request.observacoes?.trim() || null,
    pedido_origem_id: pedido.id,
    pedido_origem_item_index: itemIndex,
    pedido_origem_produto: item.produto.trim(),
    localizacao_pallet: location,
  };
}

export async function submitLinkedPalletCall(
  request: LinkedPalletRequest,
  createCall: (input: NovoChamadoInput) => Promise<unknown>
): Promise<void> {
  const input = buildLinkedPalletCallInput(request);
  await createCall(input);
}
