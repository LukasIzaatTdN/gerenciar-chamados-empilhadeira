export type BusinessAction =
  | "create_chamado"
  | "assume_chamado"
  | "start_chamado"
  | "finish_chamado"
  | "manage_empilhadeira"
  | "manage_manutencao"
  | "manage_empresa"
  | "manage_unidade"
  | "manage_usuario"
  | "view_dashboard"
  | "manage_users";

export interface BusinessScopeInput {
  canViewAllCompanies: boolean;
  canViewAllUnits: boolean;
  currentCompanyId: string | null;
  currentSupermercadoId: string | null;
  targetCompanyId?: string | null;
  targetSupermercadoId?: string | null;
  entityName?: string;
}

export interface UserAccessInput {
  isAuthenticated: boolean;
  userId?: string | null;
  perfil?: string | null;
  requiredAction?: BusinessAction;
}

export interface AuditEntry {
  action: string;
  actorUid?: string;
  actorName: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  occurredAt: string;
  empresa_id?: string;
  supermercado_id?: string;
  metadata?: Record<string, unknown>;
}

export function assertBusinessScope(input: BusinessScopeInput): void {
  const entityName = input.entityName ?? "registro";

  if (input.canViewAllCompanies) {
    return;
  }

  if (!input.currentCompanyId) {
    throw new Error(`Você não está vinculado a uma empresa para manipular ${entityName}.`);
  }

  if (
    typeof input.targetCompanyId === "string" &&
    input.targetCompanyId.trim().length > 0 &&
    input.targetCompanyId !== input.currentCompanyId
  ) {
    throw new Error(`Você só pode manipular ${entityName} da sua própria empresa.`);
  }

  if (input.canViewAllUnits) {
    return;
  }

  if (!input.currentSupermercadoId) {
    throw new Error(`Você não está vinculado a uma unidade para manipular ${entityName}.`);
  }

  if (
    typeof input.targetSupermercadoId === "string" &&
    input.targetSupermercadoId.trim().length > 0 &&
    input.targetSupermercadoId !== input.currentSupermercadoId
  ) {
    throw new Error(`Você só pode manipular ${entityName} da sua própria unidade.`);
  }
}

export function assertUserAccess(input: UserAccessInput): void {
  if (!input.isAuthenticated || !input.userId) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  if (!input.requiredAction) {
    return;
  }

  const perfil = input.perfil ?? null;
  if (!perfil) {
    throw new Error(`Seu perfil não possui autorização para esta ação.`);
  }

  const allowedByAction: Record<BusinessAction, readonly string[]> = {
    create_chamado: [
      "Promotor",
      "Funcionário",
      "Televendas",
      "Separador de Televendas",
      "Administrador da Empresa",
      "Administrador Geral",
    ],
    assume_chamado: [
      "Operador",
      "Supervisor",
      "Separador de Televendas",
      "Administrador da Empresa",
      "Administrador Geral",
    ],
    start_chamado: [
      "Operador",
      "Supervisor",
      "Separador de Televendas",
      "Administrador da Empresa",
      "Administrador Geral",
    ],
    finish_chamado: [
      "Operador",
      "Supervisor",
      "Separador de Televendas",
      "Administrador da Empresa",
      "Administrador Geral",
    ],
    manage_empilhadeira: ["Supervisor", "Administrador da Empresa", "Administrador Geral"],
    manage_manutencao: ["Supervisor", "Administrador da Empresa", "Administrador Geral"],
    manage_empresa: ["Administrador da Empresa", "Administrador Geral"],
    manage_unidade: ["Administrador da Empresa", "Administrador Geral"],
    manage_usuario: ["Administrador da Empresa", "Administrador Geral"],
    view_dashboard: [
      "Supervisor",
      "Separador de Televendas",
      "Administrador da Empresa",
      "Administrador Geral",
    ],
    manage_users: ["Administrador da Empresa", "Administrador Geral"],
  };

  const allowed = allowedByAction[input.requiredAction];
  if (!perfil || !allowed.includes(perfil)) {
    throw new Error(`Seu perfil não possui autorização para esta ação.`);
  }
}

export function assertPermissionForAction(action: BusinessAction, perfil: string | null): void {
  assertUserAccess({
    isAuthenticated: Boolean(perfil),
    userId: perfil ? "local-user" : null,
    perfil,
    requiredAction: action,
  });
}

export function createAuditEntry({
  action,
  actorUid,
  actorName,
  entityType,
  entityId,
  details,
  metadata,
}: {
  action: string;
  actorUid?: string | null;
  actorName: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): AuditEntry {
  return {
    action,
    ...(actorUid ? { actorUid } : {}),
    actorName: actorName.trim() || "Sistema",
    entityType,
    entityId,
    details,
    occurredAt: new Date().toISOString(),
    ...(typeof details.empresa_id === "string" ? { empresa_id: details.empresa_id } : {}),
    ...(typeof details.supermercado_id === "string"
      ? { supermercado_id: details.supermercado_id }
      : {}),
    ...(metadata ? { metadata } : {}),
  };
}
