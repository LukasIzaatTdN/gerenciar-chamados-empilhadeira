import type { AppNotification } from "../types/notification";
import AdminIcon from "./AdminIcon";
import NotificationCenter from "./NotificationCenter";

const sections: Record<string, string> = {
  dashboard: "Visão geral", empresas: "Empresas", unidades: "Unidades",
  usuarios: "Acessos", assinaturas: "Planos e assinaturas", auditoria: "Auditoria",
  suporte: "Consulta da operação", perfil: "Meu perfil",
};

type Props = {
  activeView: string;
  userName: string;
  dark: boolean;
  syncMode: "firebase" | "local";
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onProfile: () => void;
};

export default function AdminTopbar({ activeView, userName, dark, syncMode, notifications, unreadCount, onMarkAsRead, onMarkAllAsRead, onClearAll, onProfile }: Props) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-location" aria-label="Localização atual">
        <span className="admin-topbar-parent">Administração</span>
        <AdminIcon name="chevron" width={14} height={14} />
        <span className="admin-topbar-section">{sections[activeView] ?? "Administração"}</span>
      </div>
      <div className="admin-topbar-tools">
        <span className={`admin-sync ${syncMode === "firebase" ? "is-connected" : ""}`}>
          <span aria-hidden="true" />{syncMode === "firebase" ? "Sincronização ativa" : "Modo local"}
        </span>
        <div className="admin-notifications">
          <NotificationCenter notifications={notifications} unreadCount={unreadCount} onMarkAsRead={onMarkAsRead} onMarkAllAsRead={onMarkAllAsRead} onClearAll={onClearAll} variant={dark ? "dark" : "light"} />
        </div>
        <button type="button" className="admin-account-button" onClick={onProfile} aria-label={`Abrir meu perfil: ${userName}`}>
          <span className="admin-avatar"><AdminIcon name="user" width={18} height={18} /></span>
          <span className="admin-account-copy"><strong>{userName}</strong><span>Administrador Geral</span></span>
        </button>
      </div>
    </header>
  );
}
