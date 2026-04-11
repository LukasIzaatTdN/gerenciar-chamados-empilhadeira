import type { ItemTelevendas, UnidadeMedidaTelevendas } from "../types/chamado";

const UNIDADES_MEDIDA_VALIDAS = new Set<UnidadeMedidaTelevendas>([
  "Unidade",
  "Caixa",
  "Palete",
  "Fardo",
]);

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

export function normalizeItemTelevendas(item: Partial<ItemTelevendas>): ItemTelevendas | null {
  const produto = typeof item.produto === "string" ? item.produto.trim() : "";
  if (!produto) return null;
  const unidadeMedida =
    typeof item.unidadeMedida === "string" && UNIDADES_MEDIDA_VALIDAS.has(item.unidadeMedida as UnidadeMedidaTelevendas)
      ? (item.unidadeMedida as UnidadeMedidaTelevendas)
      : "Unidade";

  const quantidadeSolicitada = toSafeNumber(item.quantidadeSolicitada);
  if (quantidadeSolicitada <= 0) return null;
  const quantidadeEncontradaBruta = toSafeNumber(item.quantidadeEncontrada);
  const quantidadeEncontrada = Math.min(quantidadeEncontradaBruta, quantidadeSolicitada);
  const quantidadeFaltante = Math.max(0, quantidadeSolicitada - quantidadeEncontrada);

  return {
    produto,
    unidadeMedida,
    quantidadeSolicitada,
    quantidadeEncontrada,
    quantidadeFaltante,
  };
}

export function normalizeItensTelevendas(itens: Partial<ItemTelevendas>[] | null | undefined) {
  if (!Array.isArray(itens)) return [];
  return itens
    .map((item) => normalizeItemTelevendas(item))
    .filter((item): item is ItemTelevendas => Boolean(item));
}

export function getTotaisItensTelevendas(itens: ItemTelevendas[]) {
  const totalSolicitado = itens.reduce((sum, item) => sum + item.quantidadeSolicitada, 0);
  const totalEncontrado = itens.reduce((sum, item) => sum + item.quantidadeEncontrada, 0);
  const percentualAtendido =
    totalSolicitado > 0 ? Math.round((totalEncontrado / totalSolicitado) * 100) : 0;

  return {
    totalSolicitado,
    totalEncontrado,
    percentualAtendido,
  };
}

export function hasItemFaltante(itens: ItemTelevendas[]) {
  return itens.some((item) => item.quantidadeFaltante > 0);
}

export function parseProdutoQuantidadeTextToItens(produto: string | null, quantidade: string | null) {
  if (!produto?.trim()) return [];
  const quantidadeSolicitada = toSafeNumber(quantidade);

  return produto
    .split(/\r?\n|[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((produtoItem) =>
      normalizeItemTelevendas({
        produto: produtoItem,
        quantidadeSolicitada,
        quantidadeEncontrada: 0,
      })
    )
    .filter((item): item is ItemTelevendas => Boolean(item));
}

export function itensToLegacyProduto(itens: ItemTelevendas[]) {
  return itens.map((item) => item.produto).join("\n") || null;
}

export function itensToLegacyQuantidade(itens: ItemTelevendas[]) {
  const total = itens.reduce((sum, item) => sum + item.quantidadeSolicitada, 0);
  return total > 0 ? String(total) : null;
}

export function formatQuantidadeComUnidade(
  quantidade: number,
  unidadeMedida: UnidadeMedidaTelevendas
) {
  const qtd = toSafeNumber(quantidade);

  const label =
    unidadeMedida === "Unidade"
      ? qtd === 1
        ? "unidade"
        : "unidades"
      : unidadeMedida === "Caixa"
      ? qtd === 1
        ? "caixa"
        : "caixas"
      : unidadeMedida === "Palete"
      ? qtd === 1
        ? "palete"
        : "paletes"
      : qtd === 1
      ? "fardo"
      : "fardos";

  return `${qtd} ${label}`;
}
