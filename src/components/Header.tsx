import type { AppNotification } from "../types/notification";
import type { PerfilAcesso } from "../types/usuario";
import NotificationCenter from "./NotificationCenter";
import type { Supermercado } from "../types/supermercado";
import AssignedUnitSelector from "./AssignedUnitSelector";
import AdminIcon from "./AdminIcon";

interface HeaderProps {
  onNovoChamado: () => void;
  onOperadorPanel: () => void;
  onDashboard: () => void;
  onOpenEmpresasAdmin?: () => void;
  onOpenUnidadesAdmin?: () => void;
  onOpenUsuariosAdmin?: () => void;
  onOpenSupermercadosAdmin?: () => void;
  onOpenEmpilhadeiras?: () => void;
  onOpenManutencoes?: () => void;
  onAccessProfile: () => void;
  onOpenLogin: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  syncMode: "firebase" | "local";
  perfilAcesso: PerfilAcesso | null;
  usuarioNome: string | null;
  supermercadoNome: string | null;
  showCreateAction: boolean;
  showOperatorAction: boolean;
  showDashboardAction: boolean;
  showEmpresasAction?: boolean;
  showUnidadesAction?: boolean;
  showUsuariosAction?: boolean;
  showSupermercadosAction?: boolean;
  showEmpilhadeirasAction?: boolean;
  showManutencoesAction?: boolean;
  authorizedUnits?: Supermercado[];
  selectedUnitId?: string | null;
  allowConsolidatedUnitView?: boolean;
  onAuthorizedUnitChange?: (unitId: string | null) => void;
}

export default function Header({
  onNovoChamado,
  onOperadorPanel,
  onDashboard,
  onOpenEmpresasAdmin,
  onOpenUnidadesAdmin,
  onOpenUsuariosAdmin,
  onOpenSupermercadosAdmin,
  onOpenEmpilhadeiras,
  onOpenManutencoes,
  onAccessProfile,
  onOpenLogin,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  syncMode,
  perfilAcesso,
  usuarioNome,
  supermercadoNome,
  showCreateAction,
  showOperatorAction,
  showDashboardAction,
  showEmpresasAction = false,
  showUnidadesAction = false,
  showUsuariosAction = false,
  showSupermercadosAction = false,
  showEmpilhadeirasAction = false,
  showManutencoesAction = false,
  authorizedUnits = [],
  selectedUnitId = null,
  allowConsolidatedUnitView = false,
  onAuthorizedUnitChange,
}: HeaderProps) {
  const isPlatformAdmin = perfilAcesso === "Administrador Geral";
  const unidadesActionVisible = showUnidadesAction || showSupermercadosAction;
  const showProfileAction = Boolean(perfilAcesso && usuarioNome && !isPlatformAdmin);
  const showDashboardNavigationAction = showDashboardAction;
  const showCompanyNavigationAction = showEmpresasAction && !isPlatformAdmin;
  const showUnitNavigationAction = unidadesActionVisible && !isPlatformAdmin;
  const showUsersNavigationAction = showUsuariosAction && !isPlatformAdmin;
  const openUnidadesAdmin = onOpenUnidadesAdmin ?? onOpenSupermercadosAdmin;
  const syncLabel =
    syncMode === "firebase"
      ? "Sincronização ativa"
      : "Modo local";

  const fluxoAtivoLabel =
    perfilAcesso === "Promotor" || perfilAcesso === "Funcionário" || perfilAcesso === "Televendas"
      ? "Fluxo ativo: abertura e acompanhamento dos seus chamados"
      : perfilAcesso === "Operador"
      ? "Fluxo ativo: central operacional da unidade"
      : perfilAcesso === "Supervisor" || perfilAcesso === "Separador de Televendas"
      ? "Fluxo ativo: gestão e separação da fila de chamados"
      : perfilAcesso === "Gerente da Empresa"
      ? "Fluxo ativo: acesso às unidades atribuídas"
      : perfilAcesso === "Administrador da Empresa"
      ? "Fluxo ativo: gestão consolidada da empresa"
      : perfilAcesso === "Administrador Geral"
      ? "Fluxo ativo: gestão consolidada da plataforma"
      : "Fluxo ativo: acesso ao sistema";

  const createActionLabel =
    perfilAcesso === "Separador de Televendas"
      ? "Chamar Operador"
      : perfilAcesso === "Administrador Geral"
      ? "Abrir chamado"
      : "Solicitar Empilhadeira";
  const canShowCreateAction =
    showCreateAction &&
    perfilAcesso !== "Administrador da Empresa" &&
    perfilAcesso !== "Gerente da Empresa" &&
    perfilAcesso !== "Administrador Geral";
  const operatorActionLabel =
    perfilAcesso === "Operador" ? "Minha operação" : "Painel Operador";
  const dashboardActionLabel =
    perfilAcesso === "Administrador Geral"
      ? "Visão geral"
      : perfilAcesso === "Gerente da Empresa"
      ? "Unidades atribuídas"
      : perfilAcesso === "Administrador da Empresa"
      ? "Gestão Empresa"
      : "Dashboard";
  const panelTitle =
    perfilAcesso === "Promotor"
      ? "Painel do Promotor"
      : perfilAcesso === "Funcionário"
      ? "Painel do Funcionário"
      : perfilAcesso === "Operador"
      ? "Painel do Operador"
      : perfilAcesso === "Supervisor"
      ? "Painel do Supervisor"
      : perfilAcesso === "Televendas"
      ? "Painel de Televendas"
      : perfilAcesso === "Separador de Televendas"
      ? "Painel do Separador de Televendas"
      : perfilAcesso === "Gerente da Empresa"
      ? "Painel do Gerente da Empresa"
      : perfilAcesso === "Administrador da Empresa"
      ? "Painel do Administrador da Empresa"
      : perfilAcesso === "Administrador Geral"
      ? "Painel do Administrador Geral"
      : "Painel Empilhadeira";

  const navigation = [
    [showOperatorAction && !isPlatformAdmin && perfilAcesso !== "Administrador da Empresa" && perfilAcesso !== "Supervisor" && perfilAcesso !== "Separador de Televendas", onOperadorPanel, operatorActionLabel, "forklift"],
    [showDashboardNavigationAction, onDashboard, dashboardActionLabel, "chart"],
    [showEmpilhadeirasAction, onOpenEmpilhadeiras, "Empilhadeiras", "forklift"],
    [showManutencoesAction, onOpenManutencoes, "Manutenções", "settings"],
    [showCompanyNavigationAction, onOpenEmpresasAdmin, "Empresas", "company"],
    [showUnitNavigationAction, openUnidadesAdmin, "Unidades", "units"],
    [showUsersNavigationAction, onOpenUsuariosAdmin, "Usuários", "users"],
  ] as const;
  const showLoginAction = !["Administrador Geral", "Administrador da Empresa", "Supervisor", "Separador de Televendas"].includes(perfilAcesso ?? "");
  const hasNavigation = navigation.some(([visible, action]) => visible && action) || canShowCreateAction;

  return (
    <header className="workspace-header">
      <div className="app-main workspace-header-top">
        <div className="workspace-brand">
          <span className="workspace-brand-mark"><AdminIcon name="units" width={23} height={23} /></span>
          <div><strong>Pátio Pro Log</strong><span>{panelTitle}</span></div>
        </div>
        <div className="workspace-header-tools">
          <span className={`workspace-sync ${syncMode === "firebase" ? "is-connected" : ""}`}><span aria-hidden="true" />{syncLabel}</span>
          {perfilAcesso && usuarioNome && <div className="workspace-user" title={fluxoAtivoLabel}>
            <strong>{usuarioNome}</strong><span>{supermercadoNome ?? "Todas as unidades"}</span>
          </div>}
          <div className="workspace-notifications"><NotificationCenter
            notifications={notifications} unreadCount={unreadCount}
            onMarkAsRead={onMarkAsRead} onMarkAllAsRead={onMarkAllAsRead} onClearAll={onClearAll} variant="light"
          /></div>
          {showProfileAction && <button type="button" onClick={onAccessProfile} className="workspace-button workspace-button-secondary workspace-profile-action" aria-label="Abrir perfil">
            <AdminIcon name="user" width={17} height={17} /><span>Perfil</span>
          </button>}
          {showLoginAction && <button type="button" onClick={onOpenLogin} aria-label={perfilAcesso ? "Trocar Usuário" : "Entrar"} data-authenticated={Boolean(perfilAcesso)} className="workspace-button workspace-button-secondary workspace-login-action">
            <AdminIcon name="users" width={17} height={17} /><span>{perfilAcesso ? "Trocar Usuário" : "Entrar"}</span>
          </button>}
        </div>
      </div>
      {(hasNavigation || (authorizedUnits.length > 1 && onAuthorizedUnitChange)) && (
        <div className="workspace-header-navigation">
          <div className="app-main workspace-header-navigation-inner">
            {hasNavigation && <nav aria-label="Navegação do perfil" className="workspace-nav">
              {navigation.map(([visible, action, label, icon]) => visible && action ? (
                <button key={label} type="button" onClick={action} className="workspace-button workspace-button-quiet">
                  <AdminIcon name={icon} width={17} height={17} />{label}
                </button>
              ) : null)}
              {canShowCreateAction && <button type="button" onClick={onNovoChamado} className="workspace-button workspace-button-primary">
                <AdminIcon name="plus" width={18} height={18} />{createActionLabel}
              </button>}
            </nav>}
            {authorizedUnits.length > 1 && onAuthorizedUnitChange && <div className="workspace-unit-selector">
              <AssignedUnitSelector unidades={authorizedUnits} valor={selectedUnitId}
                permitirConsolidado={allowConsolidatedUnitView} onChange={onAuthorizedUnitChange} />
            </div>}
          </div>
        </div>
      )}
    </header>
  );
}
