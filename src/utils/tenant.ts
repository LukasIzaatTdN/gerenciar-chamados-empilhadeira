export const LEGACY_EMPRESA_ID = "empresa-padrao";
export const LEGACY_EMPRESA_NOME = "Empresa Padrão";

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

export function mergeScopedUnitSelection(
  currentSupermercadoId: string | null | undefined,
  currentSupermercadoIds: unknown,
  nextSupermercadoId: string
) {
  const existingUnits = normalizeScopedUnitIds(currentSupermercadoId, currentSupermercadoIds);

  return {
    supermercado_id: nextSupermercadoId,
    supermercado_ids: Array.from(new Set([...existingUnits, nextSupermercadoId.trim()])),
  };
}

export function getAccessibleSupermercadosForUser<
  T extends { id: string; empresa_id: string; status: "Ativo" | "Inativo" }
>(
  supermercados: ReadonlyArray<T>,
  usuario: {
    perfil: string;
    empresa_id: string | null;
    supermercado_id?: string | null;
    supermercado_ids?: string[] | null;
  } | null
): T[] {
  if (!usuario) return [];

  const activeUnits = supermercados.filter((item) => item.status === "Ativo");
  const empresaId = usuario.empresa_id;

  if (usuario.perfil === "Administrador Geral") {
    return activeUnits;
  }

  if (!empresaId) {
    return [];
  }

  const allowedSet = new Set<string>([
    ...(usuario.supermercado_ids ?? []),
    ...(usuario.supermercado_id ? [usuario.supermercado_id] : []),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0));

  return activeUnits.filter((item) => {
    if (item.empresa_id !== empresaId) return false;
    if (allowedSet.size === 0) return true;
    return allowedSet.has(item.id);
  });
}
