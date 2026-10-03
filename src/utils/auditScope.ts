export interface AuditScopeOptions {
  empresaId?: string | null;
  supermercadoId?: string | null;
  canViewAllCompanies?: boolean;
  canViewAllUnits?: boolean;
}

export type AuditQueryScope =
  | { type: "empresa"; id: string }
  | { type: "supermercado"; id: string }
  | { type: "todos" }
  | null;

export function resolveAuditQueryScope(options: AuditScopeOptions): AuditQueryScope {
  if (options.supermercadoId && !options.canViewAllUnits) {
    return { type: "supermercado", id: options.supermercadoId };
  }

  if (options.empresaId && options.canViewAllUnits) {
    return { type: "empresa", id: options.empresaId };
  }

  if (options.canViewAllCompanies) {
    return { type: "todos" };
  }

  return null;
}
