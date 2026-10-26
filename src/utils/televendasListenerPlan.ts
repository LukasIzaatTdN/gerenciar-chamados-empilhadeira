import type { Chamado } from "../types/chamado.ts";
import { isTelevendasChamado } from "./chamadoStatus.ts";

export const TELEVENDAS_LINKED_ORDER_IDS_LIMIT = 30;

export type TelevendasLinkedListenerChunk = {
  key: string;
  pedidoIds: string[];
};

export function diffTelevendasLinkedListenerPlan(
  activeKeys: Iterable<string>,
  nextPlan: TelevendasLinkedListenerChunk[]
) {
  const active = new Set(activeKeys);
  const next = new Set(nextPlan.map(({ key }) => key));
  return {
    removedKeys: [...active].filter((key) => !next.has(key)),
    addedChunks: nextPlan.filter(({ key }) => !active.has(key)),
  };
}

export function estimateTelevendasListenerCount(pedidoCount: number) {
  if (!Number.isInteger(pedidoCount) || pedidoCount < 0) {
    throw new RangeError("pedidoCount deve ser um inteiro não negativo.");
  }
  return 2 + Math.ceil(pedidoCount / TELEVENDAS_LINKED_ORDER_IDS_LIMIT);
}

export function buildTelevendasLinkedListenerPlan(
  pedidos: Chamado[],
  maxIds = TELEVENDAS_LINKED_ORDER_IDS_LIMIT
): TelevendasLinkedListenerChunk[] {
  if (!Number.isInteger(maxIds) || maxIds < 1 || maxIds > TELEVENDAS_LINKED_ORDER_IDS_LIMIT) {
    throw new RangeError(`maxIds deve estar entre 1 e ${TELEVENDAS_LINKED_ORDER_IDS_LIMIT}.`);
  }

  const pedidoIds = [...new Set(pedidos.filter(isTelevendasChamado).map(({ id }) => id))].sort();
  const chunks: TelevendasLinkedListenerChunk[] = [];
  for (let index = 0; index < pedidoIds.length; index += maxIds) {
    const ids = pedidoIds.slice(index, index + maxIds);
    chunks.push({ key: JSON.stringify(ids), pedidoIds: ids });
  }
  return chunks;
}

export function createListenerCallbackLease() {
  let active = true;
  return {
    isActive: () => active,
    revoke: () => { active = false; },
  };
}
