import type { ReactNode } from "react";
import AdminIcon from "./AdminIcon";

type AdminSidebarProps = {
  activeView: string;
  dark: boolean;
  userName: string;
  onNavigate: (view: "dashboard" | "empresas" | "unidades" | "usuarios" | "assinaturas" | "perfil" | "suporte" | "auditoria") => void;
  onThemeToggle: () => void;
};

const links = [
  ["dashboard", "Visão geral", "overview"],
  ["empresas", "Empresas", "company"],
  ["usuarios", "Acessos", "users"],
  ["assinaturas", "Planos e assinaturas", "subscription"],
  ["auditoria", "Auditoria", "audit"],
  ["perfil", "Meu perfil", "user"],
] as const;

export default function AdminSidebar({ activeView, dark, userName, onNavigate, onThemeToggle }: AdminSidebarProps) {
  const surface = dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-800";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const selectedView = activeView === "unidades" || activeView === "suporte" ? "empresas" : activeView;
  const nav = (items: typeof links, compact = false): ReactNode => items.map(([view, label, icon]) => (
    <button
      key={view}
      type="button"
      onClick={() => onNavigate(view)}
      aria-current={selectedView === view ? "page" : undefined}
      className={`flex min-h-11 ${compact ? "w-auto shrink-0" : "w-full"} items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedView === view ? "bg-blue-600 text-white shadow-md shadow-blue-900/15" : `${muted} hover:bg-slate-500/10 hover:text-current`}`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center"><AdminIcon name={icon} /></span>
      {label}
    </button>
  ));

  return (
    <aside aria-label="Navegação do Administrador Geral" className={`admin-sidebar rounded-2xl border p-3 shadow-sm md:p-4 ${surface}`}>
      <div className="admin-sidebar-brand flex items-center gap-3 px-1 pb-2 md:pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><AdminIcon name="units" width={23} height={23} /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">Pátio Pro Log</p>
          <p className={`text-xs ${muted}`}>Administração</p>
        </div>
      </div>
      <nav className="admin-sidebar-desktop">{nav(links)}</nav>
      <nav aria-label="Navegação rápida" className="admin-sidebar-mobile">{nav(links, true)}</nav>
      <div className="admin-sidebar-footer">
        <div className="admin-sidebar-account">
          <p className={`px-2 text-xs ${muted}`}>Conectado como</p>
          <p className="truncate px-2 pt-1 text-sm font-bold">{userName}</p>
        </div>
        <button type="button" onClick={onThemeToggle} aria-label={`Ativar tema ${dark ? "claro" : "escuro"}`} aria-pressed={dark} className={`admin-sidebar-theme flex min-h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`}>
          <span>{dark ? "Tema escuro" : "Tema claro"}</span><AdminIcon name={dark ? "moon" : "sun"} width={18} height={18} />
        </button>
      </div>
    </aside>
  );
}
