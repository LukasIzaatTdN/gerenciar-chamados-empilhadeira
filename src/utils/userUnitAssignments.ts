import { resolveAuthorizedUnitIds } from "./tenant.ts";

interface UserUnitAssignmentData {
  supermercado_id?: string | null;
  supermercado_ids?: unknown;
  vinculos_unidades_v2?: unknown;
}

// A legacy ID array declares scope; it does not prove migration to link documents.
export function normalizeUserUnitAssignments(data: UserUnitAssignmentData) {
  return {
    supermercado_ids: resolveAuthorizedUnitIds(data.supermercado_id, data.supermercado_ids),
    vinculos_unidades_v2: data.vinculos_unidades_v2 === true,
  };
}
