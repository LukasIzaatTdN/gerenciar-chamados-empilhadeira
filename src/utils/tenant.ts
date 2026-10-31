export const LEGACY_EMPRESA_ID = "empresa-padrao";
export const LEGACY_EMPRESA_NOME = "Empresa Padrão";
export const MAX_UNIDADES_POR_USUARIO = 8;

export function resolveAuthorizedUnitIds(
  supermercadoId: string | null | undefined,
  supermercadoIds: unknown,
  maxUnits = MAX_UNIDADES_POR_USUARIO
) {
  if (Array.isArray(supermercadoIds)) {
    const cleaned = supermercadoIds.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    ).map((item) => item.trim());
    if (
      cleaned.length !== supermercadoIds.length ||
      new Set(cleaned).size !== cleaned.length ||
      cleaned.length > maxUnits
    ) return [];
    return cleaned;
  }

  return typeof supermercadoId === "string" && supermercadoId.trim()
    ? [supermercadoId.trim()]
    : [];
}

export function sanitizeTenantId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function resolveEmpresaId<T extends string | null>(
  value: unknown,
  fallback: T = LEGACY_EMPRESA_ID as T
) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return (normalized || fallback) as T;
}

export function normalizeScopedUnitIds(
  supermercadoId: string | null | undefined,
  supermercadoIds: unknown
) {
  const unidades = Array.isArray(supermercadoIds)
    ? supermercadoIds.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];

  if (typeof supermercadoId === "string" && supermercadoId.trim()) {
    return Array.from(new Set([supermercadoId.trim(), ...unidades]));
  }

  return Array.from(new Set(unidades));
}
