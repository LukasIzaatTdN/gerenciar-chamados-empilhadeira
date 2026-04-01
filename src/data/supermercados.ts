import type { Supermercado } from "../types/supermercado";

export const SUPERMERCADOS: Supermercado[] = [
  {
    id: "sm-centro",
    nome: "Supermercado Centro",
    codigo: "CTR",
    endereco: "Av. Historiador Rubens de Mendonça, 2500 - Cuiabá/MT",
    status: "Ativo",
    criado_em: "2026-01-05T10:00:00.000Z",
  },
  {
    id: "sm-jardim",
    nome: "Supermercado Jardim",
    codigo: "JDM",
    endereco: "Av. Filinto Muller, 680 - Várzea Grande/MT",
    status: "Ativo",
    criado_em: "2026-01-06T10:00:00.000Z",
  },
  {
    id: "sm-norte",
    nome: "Supermercado Norte",
    codigo: "NRT",
    endereco: "Av. Fernando Corrêa da Costa, 1420 - Cuiabá/MT",
    status: "Ativo",
    criado_em: "2026-01-07T10:00:00.000Z",
  },
];

export function getSupermercadoById(
  supermercadoId: string | null | undefined,
  supermercados: Supermercado[] = SUPERMERCADOS
) {
  if (!supermercadoId) return null;
  return supermercados.find((item) => item.id === supermercadoId) ?? null;
}
