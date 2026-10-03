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
  const isSupervisor = perfil === "Supervisor";
  const isSeparator = perfil === "Separador de Televendas";
  const canAccessOperatorPanel =
    perfil === "Operador" ||
    isSupervisor ||
    isSeparator ||
    isCompanyAdmin ||
    isPlatformAdmin;

  return {
    canCreateChamado:
      perfil === "Promotor" ||
      perfil === "Funcionário" ||
      perfil === "Televendas" ||
      perfil === "Separador de Televendas" ||
      isCompanyAdmin ||
      isPlatformAdmin,
    canTrackOwnChamados:
      perfil === "Promotor" || perfil === "Funcionário" || perfil === "Televendas",
    canAccessOperatorPanel,
    canManageOperatorQueue: canAccessOperatorPanel,
    canViewUnitDashboard:
      isSupervisor || isCompanyAdmin || isPlatformAdmin,
    canViewUnitQueue:
      isSupervisor || isSeparator || isCompanyAdmin || isPlatformAdmin,
    canViewHistoryAndReports:
      isSupervisor || isCompanyAdmin || isPlatformAdmin,
    canViewAllUnits: isCompanyAdmin || isPlatformAdmin,
    canViewAllCompanies: isPlatformAdmin,
    canManageCompanyAdmin: isCompanyAdmin || isPlatformAdmin,
  };
}
