import type { Chamado, ItemTelevendas } from "../types/chamado";
import { normalizeItensTelevendas } from "./televendasItems.ts";

export interface SeparationConfirmationInput {
  pedido: Chamado;
  chamado: Chamado;
  itemIndex: number;
  quantidade: number;
  justificativa: string;
  actorUid: string;
}

export interface SeparationConfirmationSummary {
  solicitada: number;
  separada: number;
  restante: number;
  unidade: ItemTelevendas["unidadeMedida"];
}

export function getConfirmedQuantityForItem(pedido: Chamado, itemIndex: number): number {
  return Object.values(pedido.confirmacoes_empilhadeira ?? {}).reduce((sum, marker) =>
    typeof marker === "object" && marker !== null && marker.item_index === itemIndex
      ? sum + Math.max(0, Math.floor(marker.quantidade || 0))
      : sum, 0);
}

export function hasForkliftReceiptForItem(pedido: Chamado, itemIndex: number): boolean {
  return Object.values(pedido.confirmacoes_empilhadeira ?? {}).some((marker) =>
    typeof marker === "object" && marker !== null && marker.item_index === itemIndex
  );
}

export function buildManualSeparationConfirmation(pedido: Chamado, itemIndex: number, targetQuantity: number) {
  if (!isTelevendasOrder(pedido) || pedido.status !== "Em separação" ||
      !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= pedido.itens.length) {
    throw new Error("Pedido ou item inválido para confirmação manual.");
  }
  if (hasForkliftReceiptForItem(pedido, itemIndex)) {
    throw new Error("Este item já teve o recebimento da empilhadeira confirmado.");
  }
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) {
    throw new Error("Informe uma quantidade inteira válida.");
  }
  const itens = normalizeItensTelevendas(pedido.itens);
  const item = itens[itemIndex];
  if (targetQuantity < item.quantidadeEncontrada) {
    throw new Error("A confirmação manual não pode reduzir uma quantidade já registrada.");
  }
  if (targetQuantity > item.quantidadeSolicitada) {
    throw new Error("A quantidade separada não pode exceder a solicitada.");
  }
  const quantidade = targetQuantity - item.quantidadeEncontrada;
  itens[itemIndex] = {
    ...item,
    quantidadeEncontrada: targetQuantity,
    quantidadeFaltante: item.quantidadeSolicitada - targetQuantity,
  };
  return { itens, quantidade, item };
}

export function getSeparationConfirmationSummary(pedido: Chamado, itemIndex: number): SeparationConfirmationSummary {
  if (!isTelevendasOrder(pedido) || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= pedido.itens.length) {
    throw new Error("Pedido ou item inválido para confirmação.");
  }
  const item = normalizeItensTelevendas(pedido.itens)[itemIndex];
  if (!item) throw new Error("O item do pedido não foi encontrado.");
  const solicitada = item.quantidadeSolicitada;
  const separada = Math.min(solicitada, item.quantidadeEncontrada);
  return { solicitada, separada, restante: Math.max(0, solicitada - separada), unidade: item.unidadeMedida };
}

export function isTelevendasOrder(call: Chamado): boolean {
  return call.categoria === "televendas" || call.tipo_servico === "Atendimento Televendas";
}

export function buildSeparationConfirmation(input: SeparationConfirmationInput) {
  const { pedido, chamado, itemIndex, quantidade, justificativa, actorUid } = input;
  if (!actorUid.trim()) throw new Error("Sessão não identificada. Faça login novamente.");
  if (!isTelevendasOrder(pedido) || pedido.status === "Cancelado" || pedido.status === "Finalizado") {
    throw new Error("O pedido não aceita novas confirmações.");
  }
  if (chamado.categoria !== "operacional" || chamado.status !== "Finalizado" ||
      chamado.pedido_origem_id !== pedido.id || chamado.pedido_origem_item_index !== itemIndex ||
      chamado.empresa_id !== pedido.empresa_id || chamado.supermercado_id !== pedido.supermercado_id ||
      chamado.pedido_origem_produto?.trim() !== pedido.itens[itemIndex]?.produto.trim()) {
    throw new Error("O chamado não está finalizado e vinculado a este item.");
  }
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) throw new Error("Informe uma quantidade inteira válida.");
  const summary = getSeparationConfirmationSummary(pedido, itemIndex);
  if (quantidade > summary.restante) throw new Error(`A quantidade excede o restante de ${summary.restante} ${summary.unidade}.`);
  if (quantidade === 0 && !justificativa.trim()) throw new Error("Informe uma justificativa para confirmar quantidade zero.");
  const itens = normalizeItensTelevendas(pedido.itens);
  const item = itens[itemIndex];
  const quantidadeEncontrada = item.quantidadeEncontrada + quantidade;
  if (quantidadeEncontrada > item.quantidadeSolicitada) throw new Error("A quantidade separada não pode exceder a solicitada.");
  itens[itemIndex] = {
    ...item,
    quantidadeEncontrada,
    quantidadeFaltante: item.quantidadeSolicitada - quantidadeEncontrada,
    recebimentoEmpilhadeiraConfirmado: true,
  };
  return { itens, summary, quantidade, justificativa: justificativa.trim() || null };
}
