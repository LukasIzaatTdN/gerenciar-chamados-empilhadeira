import type { Supermercado } from "../types/supermercado";

export const SUPERMERCADOS: Supermercado[] = [];

export function getSupermercadoById(
  supermercadoId: string | null | undefined,
  supermercados: Supermercado[] = SUPERMERCADOS
) {
  if (!supermercadoId) return null;
  return supermercados.find((item) => item.id === supermercadoId) ?? null;
}
