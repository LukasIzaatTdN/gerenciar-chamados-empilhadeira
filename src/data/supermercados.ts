import type { Supermercado } from "../types/supermercado";
import { LEGACY_EMPRESA_ID } from "../utils/tenant";

export const SUPERMERCADOS: Supermercado[] = [
  {
    id: "sm-centro",
    empresa_id: LEGACY_EMPRESA_ID,
    nome: "Supermercado Centro",
    codigo: "CTR",
    endereco: "Av. Principal, 1000 - Centro",
    status: "Ativo",
    criado_em: "2026-04-02T00:00:00.000Z",
  },
];

export function getSupermercadoById(
  supermercadoId: string | null | undefined,
  supermercados: Supermercado[] = SUPERMERCADOS
) {
  if (!supermercadoId) return null;
  return supermercados.find((item) => item.id === supermercadoId) ?? null;
}
