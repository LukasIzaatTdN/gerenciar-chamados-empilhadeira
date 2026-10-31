import type { ReactNode } from "react";

type AdminSidebarProps = {
  activeView: string;
  dark: boolean;
  userName: string;
  onNavigate: (view: "dashboard" | "empresas" | "unidades" | "usuarios" | "assinaturas") => void;
  onThemeToggle: () => void;
};

const links = [
  ["dashboard", "Visão geral", "▦"],
  ["empresas", "Empresas", "▤"],
  ["unidades", "Unidades", "⌖"],
  ["usuarios", "Usuários", "♙"],
  ["assinaturas", "Assinaturas", "◇"],
] as const;

export default function AdminSidebar({ activeView, dark, userName, onNavigate, onThemeToggle }: AdminSidebarProps) {
  const surface = dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-800";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const nav = (items: typeof links): ReactNode => items.map(([view, label, icon]) => (
    <button
      key={view}
      type="button"
      onClick={() => onNavigate(view)}
      aria-current={activeView === view ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeView === view ? "bg-blue-600 text-white shadow-md shadow-blue-900/15" : `${muted} hover:bg-slate-500/10 hover:text-current`}`}
    >
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-slate-500/10 text-base">{icon}</span>
      {label}
    </button>
  ));

  return (
    <aside aria-label="Navegação do Administrador Geral" className={`rounded-2xl border p-4 shadow-sm ${surface}`}>
      <div className="flex items-center gap-3 px-1 pb-4">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-xl text-white" aria-hidden="true">⌂</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">Pátio Pro Log</p>
          <p className={`text-xs ${muted}`}>Administração</p>
        </div>
      </div>
      <nav className="hidden space-y-1 border-t border-slate-500/15 pt-4 md:block">{nav(links)}</nav>
      <nav aria-label="Navegação rápida" className="grid grid-cols-2 gap-2 border-t border-slate-500/15 pt-4 md:hidden">{nav(links)}</nav>
      <div className="mt-5 border-t border-slate-500/15 pt-4">
        <p className={`px-2 text-xs ${muted}`}>Conectado como</p>
        <p className="truncate px-2 pt-1 text-sm font-bold">{userName}</p>
        <button type="button" onClick={onThemeToggle} aria-label={`Ativar tema ${dark ? "claro" : "escuro"}`} aria-pressed={dark} className={`mt-4 flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`}>
          <span>{dark ? "Tema escuro" : "Tema claro"}</span><span aria-hidden="true">{dark ? "☾" : "☀"}</span>
        </button>
      </div>
    </aside>
  );
}
