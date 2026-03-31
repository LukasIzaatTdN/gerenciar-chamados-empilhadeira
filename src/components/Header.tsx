import type { AppNotification } from "../types/notification";
import NotificationCenter from "./NotificationCenter";
import type { PerfilAcesso } from "./OperadorLogin";

interface HeaderProps {
  onNovoChamado: () => void;
  onOperadorPanel: () => void;
  onAccessProfile: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  syncMode: "firebase" | "local";
  perfilAcesso: PerfilAcesso | null;
  usuarioNome: string | null;
  canCreateChamado: boolean;
  canAccessOperatorPanel: boolean;
}

export default function Header({
  onNovoChamado,
  onOperadorPanel,
  onAccessProfile,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  syncMode,
  perfilAcesso,
  usuarioNome,
  canCreateChamado,
  canAccessOperatorPanel,
}: HeaderProps) {
  const syncLabel =
    syncMode === "firebase" ? "Firebase ativo" : "Modo local";

  const accessButtonLabel = canAccessOperatorPanel
    ? "Painel Operador"
    : perfilAcesso
    ? "Trocar Perfil"
    : "Entrar";

  const syncBadgeClassName =
    syncMode === "firebase"
      ? "border-emerald-200/40 bg-emerald-500/15 text-emerald-50"
      : "border-amber-200/40 bg-amber-500/15 text-amber-50";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,61,117,0.97),rgba(15,23,42,0.95))] shadow-[0_16px_38px_rgba(15,23,42,0.18)] backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm">
              <span className="text-2xl">🏗️</span>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Painel Empilhadeira
              </h1>
              <p className="text-xs text-slate-200/90 sm:text-sm">
                Operação ágil para pátio, docas e estoque
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div
              className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-sm sm:self-auto ${syncBadgeClassName}`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  syncMode === "firebase" ? "bg-emerald-300" : "bg-amber-200"
                }`}
              />
              {syncLabel}
            </div>

            {perfilAcesso && usuarioNome && (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/25 bg-slate-950/10 px-3 py-1 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:self-auto">
                <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                {usuarioNome} · {perfilAcesso}
              </div>
            )}

            <div className="hidden items-center gap-2 sm:flex">
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={onMarkAsRead}
                onMarkAllAsRead={onMarkAllAsRead}
                onClearAll={onClearAll}
                variant="light"
              />

              {perfilAcesso && usuarioNome && (
                <button
                  onClick={onAccessProfile}
                  className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95"
                >
                  <span>⚙️</span>
                  <span>Perfil</span>
                </button>
              )}

              <button
                onClick={canAccessOperatorPanel ? onOperadorPanel : onAccessProfile}
                className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95"
              >
                <span>👷</span>
                <span className="hidden sm:inline">{accessButtonLabel}</span>
                <span className="sm:hidden">{canAccessOperatorPanel ? "Operador" : "Entrar"}</span>
              </button>
              <button
                onClick={onNovoChamado}
                className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg transition-all active:scale-95 sm:px-6 sm:text-base ${
                  canCreateChamado
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400 hover:shadow-xl"
                    : "bg-white/10 text-white hover:bg-white/16 hover:shadow-xl"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                <span className="hidden sm:inline">
                  {canCreateChamado ? "Solicitar Empilhadeira" : "Acesso para Solicitar"}
                </span>
                <span className="sm:hidden">{canCreateChamado ? "Solicitar" : "Entrar"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
