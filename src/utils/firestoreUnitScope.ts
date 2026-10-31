import { query, where, type CollectionReference, type Query } from "firebase/firestore";
import { MAX_UNIDADES_POR_USUARIO } from "./tenant.ts";

export interface FirestoreUnitScope {
  empresaId: string | null;
  supermercadoId?: string | null;
  supermercadoIds?: string[];
  canViewAllCompanies: boolean;
}

export function resolveQueryUnitIds(scope: FirestoreUnitScope) {
  const allowed = Array.isArray(scope.supermercadoIds)
    ? [...new Set(scope.supermercadoIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];

  if (allowed.length > MAX_UNIDADES_POR_USUARIO) return [];
  if (scope.supermercadoId) return allowed.includes(scope.supermercadoId) ? [scope.supermercadoId] : [];
  return allowed;
}

export function matchesFirestoreUnitScope(
  scope: FirestoreUnitScope,
  empresaId: string,
  supermercadoId: string
) {
  if (scope.canViewAllCompanies) {
    return (!scope.empresaId || empresaId === scope.empresaId)
      && (!scope.supermercadoId || supermercadoId === scope.supermercadoId);
  }
  return Boolean(scope.empresaId === empresaId && resolveQueryUnitIds(scope)?.includes(supermercadoId));
}

export function queryByUnitScope<T>(
  collectionRef: CollectionReference<T>,
  unitField: string,
  scope: FirestoreUnitScope
): Query<T> | null {
  if (scope.canViewAllCompanies) {
    if (scope.supermercadoId) return query(collectionRef, where(unitField, "==", scope.supermercadoId));
    if (scope.empresaId) return query(collectionRef, where("empresa_id", "==", scope.empresaId));
    return collectionRef;
  }

  const unitIds = resolveQueryUnitIds(scope);
  if (!unitIds?.length) return null;
  return unitIds.length === 1
    ? query(collectionRef, where(unitField, "==", unitIds[0]))
    : query(collectionRef, where(unitField, "in", unitIds));
}

