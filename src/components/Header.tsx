import type { AppNotification } from "../types/notification";
import NotificationCenter from "./NotificationCenter";

interface HeaderProps {
  onNovoChamado: () => void;
  onOperadorPanel: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  syncMode: "firebase" | "local";
}

export default function Header({
  onNovoChamado,
  onOperadorPanel,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  syncMode,
}: HeaderProps) {
  const syncLabel =
    syncMode === "firebase" ? "Firebase ativo" : "Modo local";

  const syncBadgeClassName =
    syncMode === "firebase"
      ? "border-emerald-200/40 bg-emerald-500/15 text-emerald-50"
      : "border-amber-200/40 bg-amber-500/15 text-amber-50";

  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-[linear-gradient(135deg,rgba(251,191,36,0.94),rgba(249,115,22,0.94))] shadow-[0_14px_34px_rgba(249,115,22,0.18)] backdrop-blur-xl">
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
              <p className="text-xs text-orange-50/90 sm:text-sm">
                Operacao agil para patio, docas e estoque
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

            <div className="hidden items-center gap-2 sm:flex">
            {/* Notification Center */}
            <NotificationCenter
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAsRead={onMarkAsRead}
              onMarkAllAsRead={onMarkAllAsRead}
              onClearAll={onClearAll}
              variant="light"
            />

            <button
              onClick={onOperadorPanel}
              className="flex items-center gap-2 rounded-xl border-2 border-white/30 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 hover:border-white/50 active:scale-95 sm:px-4"
            >
              <span>👷</span>
              <span className="hidden sm:inline">Painel Operador</span>
              <span className="sm:hidden">Operador</span>
            </button>
            <button
              onClick={onNovoChamado}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 shadow-lg transition-all hover:bg-orange-50 hover:shadow-xl active:scale-95 sm:px-6 sm:text-base"
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
              <span className="hidden sm:inline">Solicitar Empilhadeira</span>
              <span className="sm:hidden">Solicitar</span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
