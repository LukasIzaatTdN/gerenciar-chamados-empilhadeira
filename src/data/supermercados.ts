import type { Supermercado } from "../types/supermercado";

export const SUPERMERCADOS: Supermercado[] = [
  {
    id: "sm-centro",
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
