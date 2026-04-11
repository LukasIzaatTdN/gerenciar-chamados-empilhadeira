import type { Empilhadeira } from "../types/empilhadeira";

export const EMPILHADEIRAS: Empilhadeira[] = [];

export function getEmpilhadeiraById(
  empilhadeiraId: string | null | undefined,
  empilhadeiras: Empilhadeira[] = EMPILHADEIRAS
) {
  if (!empilhadeiraId) return null;
  return empilhadeiras.find((item) => item.id === empilhadeiraId) ?? null;
}
