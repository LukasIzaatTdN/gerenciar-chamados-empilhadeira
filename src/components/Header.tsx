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
}

export default function Header({
  onNovoChamado,
  onOperadorPanel,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
}: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 shadow-lg">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <span className="text-2xl">🏗️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl">
                Painel Empilhadeira
              </h1>
              <p className="text-xs text-orange-100 sm:text-sm">
                Gerenciamento de Chamados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
    </header>
  );
}
