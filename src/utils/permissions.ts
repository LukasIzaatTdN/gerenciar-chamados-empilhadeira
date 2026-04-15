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
  canViewAllCompanies: boolean;
  canManageCompanyAdmin: boolean;
}

export function getPermissions(perfil: PerfilAcesso | null): AccessPermissions {
  const isCompanyAdmin = perfil === "Administrador da Empresa";
  const isPlatformAdmin = perfil === "Administrador Geral";
  const canAccessOperatorPanel =
    perfil === "Operador" ||
    perfil === "Supervisor" ||
    isCompanyAdmin ||
    isPlatformAdmin;

  return {
    canCreateChamado:
      perfil === "Promotor" ||
      perfil === "Funcionário" ||
      perfil === "Televendas" ||
      isCompanyAdmin ||
      isPlatformAdmin,
    canTrackOwnChamados:
      perfil === "Promotor" || perfil === "Funcionário" || perfil === "Televendas",
    canAccessOperatorPanel,
    canManageOperatorQueue: canAccessOperatorPanel,
    canViewUnitDashboard:
      perfil === "Supervisor" || isCompanyAdmin || isPlatformAdmin,
    canViewUnitQueue:
      perfil === "Supervisor" || isCompanyAdmin || isPlatformAdmin,
    canViewHistoryAndReports:
      perfil === "Supervisor" || isCompanyAdmin || isPlatformAdmin,
    canViewAllUnits: isCompanyAdmin || isPlatformAdmin,
    canViewAllCompanies: isPlatformAdmin,
    canManageCompanyAdmin: isCompanyAdmin || isPlatformAdmin,
  };
}
