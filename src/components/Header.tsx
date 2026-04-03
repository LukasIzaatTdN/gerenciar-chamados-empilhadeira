import type { AppNotification } from "../types/notification";
import type { PerfilAcesso } from "../types/usuario";
import NotificationCenter from "./NotificationCenter";

interface HeaderProps {
  onNovoChamado: () => void;
  onOperadorPanel: () => void;
  onDashboard: () => void;
  onOpenSupermercadosAdmin?: () => void;
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
  showSupermercadosAction?: boolean;
}

export default function Header({
  onNovoChamado,
  onOperadorPanel,
  onDashboard,
  onOpenSupermercadosAdmin,
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
  showSupermercadosAction = false,
}: HeaderProps) {
  const firebaseProjectId =
    typeof import.meta.env.VITE_FIREBASE_PROJECT_ID === "string"
      ? import.meta.env.VITE_FIREBASE_PROJECT_ID
      : "";
  const syncLabel =
    syncMode === "firebase"
      ? firebaseProjectId
        ? `Firebase ativo · ${firebaseProjectId}`
        : "Firebase ativo"
      : "Modo local";

  const syncBadgeClassName =
    syncMode === "firebase"
      ? "border-emerald-200/40 bg-emerald-500/15 text-emerald-50"
      : "border-amber-200/40 bg-amber-500/15 text-amber-50";

  const fluxoAtivoLabel =
    perfilAcesso === "Promotor" || perfilAcesso === "Funcionário"
      ? "Fluxo ativo: abertura e acompanhamento dos seus chamados"
      : perfilAcesso === "Operador"
      ? "Fluxo ativo: central operacional da unidade"
      : perfilAcesso === "Supervisor"
      ? "Fluxo ativo: supervisão da unidade"
      : perfilAcesso === "Administrador Geral"
      ? "Fluxo ativo: gestão consolidada das unidades"
      : "Fluxo ativo: acesso ao sistema";

  const createActionLabel =
    perfilAcesso === "Administrador Geral" ? "Abrir chamado" : "Solicitar Empilhadeira";
  const operatorActionLabel =
    perfilAcesso === "Operador" ? "Minha operação" : "Painel Operador";
  const dashboardActionLabel =
    perfilAcesso === "Administrador Geral" ? "Gestão Geral" : "Dashboard";

  const getActionClassName = (isPrimary: boolean) =>
    isPrimary
      ? "flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition-all active:scale-95 hover:bg-amber-400 hover:shadow-xl sm:px-6 sm:text-base"
      : "flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[linear-gradient(140deg,rgba(15,61,117,0.97),rgba(15,23,42,0.95))] shadow-[0_16px_38px_rgba(15,23,42,0.18)] backdrop-blur-xl">
      <div className="app-main px-2 py-3 sm:px-0 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-slate-950/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm">
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
              <div className="flex flex-col gap-1 self-start sm:items-end sm:self-auto">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/10 px-3 py-1 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                  {usuarioNome} · {perfilAcesso}
                  {supermercadoNome ? ` · ${supermercadoNome}` : " · Todas as unidades"}
                </div>
                <p className="text-[11px] font-medium text-slate-200/85">{fluxoAtivoLabel}</p>
              </div>
            )}

            <div className="hidden items-center gap-2 sm:flex md:flex-wrap md:justify-end">
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
                  className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95 lg:px-5"
                >
                  <span>⚙️</span>
                  <span>Perfil</span>
                </button>
              )}

              <button
                onClick={onOpenLogin}
                className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95 lg:px-5"
              >
                <span>🔐</span>
                <span>{perfilAcesso ? "Trocar Usuário" : "Entrar"}</span>
              </button>

              {showOperatorAction && (
                <button
                  onClick={onOperadorPanel}
                  className={getActionClassName(perfilAcesso === "Operador")}
                >
                  <span>👷</span>
                  <span>{operatorActionLabel}</span>
                </button>
              )}
              {showDashboardAction && (
                <button
                  onClick={onDashboard}
                  className={getActionClassName(
                    perfilAcesso === "Supervisor" || perfilAcesso === "Administrador Geral"
                  )}
                >
                  <span>📈</span>
                  <span>{dashboardActionLabel}</span>
                </button>
              )}
              {showSupermercadosAction && onOpenSupermercadosAdmin && (
                <button
                  onClick={onOpenSupermercadosAdmin}
                  className={getActionClassName(perfilAcesso === "Administrador Geral")}
                >
                  <span>🏬</span>
                  <span>Supermercados</span>
                </button>
              )}
              {showCreateAction && (
                <button
                  onClick={onNovoChamado}
                  className={getActionClassName(
                    perfilAcesso === "Promotor" ||
                      perfilAcesso === "Funcionário" ||
                      (!perfilAcesso && !showOperatorAction && !showDashboardAction)
                  )}
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
                  <span>{createActionLabel}</span>
                </button>
              )}
            </div>

            <div className="sm:hidden">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                    className="touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white"
                  >
                    <span>⚙️</span>
                    <span>Perfil</span>
                  </button>
                )}

                <button
                  onClick={onOpenLogin}
                  className="touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white"
                >
                  <span>🔐</span>
                  <span>{perfilAcesso ? "Trocar Usuário" : "Entrar"}</span>
                </button>

                {showOperatorAction && (
                  <button
                    onClick={onOperadorPanel}
                    className={`touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${
                      perfilAcesso === "Operador"
                        ? "bg-amber-500 text-slate-950"
                        : "border border-white/20 bg-white/10 text-white"
                    }`}
                  >
                    <span>👷</span>
                    <span>{operatorActionLabel}</span>
                  </button>
                )}

                {showDashboardAction && (
                  <button
                    onClick={onDashboard}
                    className={`touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${
                      perfilAcesso === "Supervisor" || perfilAcesso === "Administrador Geral"
                        ? "bg-amber-500 text-slate-950"
                        : "border border-white/20 bg-white/10 text-white"
                    }`}
                  >
                    <span>📈</span>
                    <span>{dashboardActionLabel}</span>
                  </button>
                )}

                {showSupermercadosAction && onOpenSupermercadosAdmin && (
                  <button
                    onClick={onOpenSupermercadosAdmin}
                    className={`touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${
                      perfilAcesso === "Administrador Geral"
                        ? "bg-amber-500 text-slate-950"
                        : "border border-white/20 bg-white/10 text-white"
                    }`}
                  >
                    <span>🏬</span>
                    <span>Supermercados</span>
                  </button>
                )}

                {showCreateAction && (
                  <button
                    onClick={onNovoChamado}
                    className={`touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${
                      perfilAcesso === "Promotor" ||
                      perfilAcesso === "Funcionário" ||
                      (!perfilAcesso && !showOperatorAction && !showDashboardAction)
                        ? "bg-amber-500 text-slate-950"
                        : "border border-white/20 bg-white/10 text-white"
                    }`}
                  >
                    <span>＋</span>
                    <span>{createActionLabel}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
