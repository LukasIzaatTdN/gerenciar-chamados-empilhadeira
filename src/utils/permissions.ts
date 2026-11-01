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
  canManageUnits: boolean;
  canViewAllCompanies: boolean;
  canManageCompanyAdmin: boolean;
}

export function getPermissions(perfil: PerfilAcesso | null): AccessPermissions {
  const isCompanyManager = perfil === "Gerente da Empresa";
  const isPlatformAdmin = perfil === "Administrador Geral";
  const isSeparator = perfil === "Separador de Televendas";
  const canAccessOperatorPanel =
    perfil === "Operador" ||
    isSeparator;

  return {
    canCreateChamado:
      perfil === "Televendas" ||
      perfil === "Separador de Televendas",
    canTrackOwnChamados:
      perfil === "Televendas",
    canAccessOperatorPanel,
    canManageOperatorQueue: canAccessOperatorPanel,
    canViewUnitDashboard:
      isCompanyManager || isPlatformAdmin,
    canViewUnitQueue:
      isSeparator,
    canViewHistoryAndReports:
      isCompanyManager || isPlatformAdmin,
    canViewAllUnits: isPlatformAdmin,
    canManageUnits: isPlatformAdmin,
    canViewAllCompanies: isPlatformAdmin,
    canManageCompanyAdmin: isPlatformAdmin,
  };
}
