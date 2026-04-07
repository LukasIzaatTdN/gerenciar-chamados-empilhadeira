import type { PerfilAcesso } from "../types/usuario";

export interface AccessPermissions {
  canCreateChamado: boolean;
  canTrackOwnChamados: boolean;
  canAccessOperatorPanel: boolean;
  canManageOperatorQueue: boolean;
  canViewUnitDashboard: boolean;
  canViewUnitQueue: boolean;
  canViewHistoryAndReports: boolean;
  canViewAllUnits: boolean;
}

export function getPermissions(perfil: PerfilAcesso | null): AccessPermissions {
  const canAccessOperatorPanel =
    perfil === "Operador" ||
    perfil === "Supervisor" ||
    perfil === "Administrador Geral";

  return {
    canCreateChamado:
      perfil === "Promotor" ||
      perfil === "Funcionário" ||
      perfil === "Televendas" ||
      perfil === "Administrador Geral",
    canTrackOwnChamados:
      perfil === "Promotor" || perfil === "Funcionário" || perfil === "Televendas",
    canAccessOperatorPanel,
    canManageOperatorQueue: canAccessOperatorPanel,
    canViewUnitDashboard: perfil === "Supervisor" || perfil === "Administrador Geral",
    canViewUnitQueue: perfil === "Supervisor" || perfil === "Administrador Geral",
    canViewHistoryAndReports: perfil === "Supervisor" || perfil === "Administrador Geral",
    canViewAllUnits: perfil === "Administrador Geral",
  };
}
