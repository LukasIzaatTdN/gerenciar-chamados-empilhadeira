import { cn } from "../utils/cn";
import type { PerfilAcesso } from "../types/usuario";
import type { Supermercado } from "../types/supermercado";

type ThemeMode = "light" | "dark";

interface ProfileSettingsProps {
  nome: string;
  perfil: PerfilAcesso;
  supermercadoId: string | null;
  supermercadoNome: string | null;
  supermercados: Supermercado[];
  setorPrincipal: string;
  notificacoesAtivas: boolean;
  somAtivo: boolean;
  tema: ThemeMode;
  onSupermercadoChange: (supermercadoId: string) => void | Promise<void>;
  onSetorPrincipalChange: (setor: string) => void;
  onNotificacoesChange: (enabled: boolean) => void;
  onSomChange: (enabled: boolean) => void;
  onTemaChange: (theme: ThemeMode) => void;
  onVoltar: () => void;
  backLabel?: string;
  showManageUnidadesAction?: boolean;
  onManageUnidades?: () => void;
  onLogout: () => void;
}

const SETORES = ["Armazém", "Docas", "Estoque", "Expedição", "Pátio", "Recebimento"];

function Toggle({
  enabled,
  onChange,
  label,
  description,
  isDark,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description: string;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-[24px] border px-4 py-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.1)]",
        isDark
          ? "border-slate-700/80 bg-slate-900/70 hover:border-slate-600"
          : "border-slate-200/80 bg-white/80 hover:border-slate-300"
      )}
      aria-pressed={enabled}
    >
      <div>
        <p className={cn("text-sm font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>
          {label}
        </p>
        <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
          {description}
        </p>
      </div>

      <span
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors",
          enabled ? "bg-emerald-500" : isDark ? "bg-slate-700" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "h-6 w-6 rounded-full bg-white shadow-[0_6px_18px_rgba(15,23,42,0.2)] transition-transform",
            enabled ? "translate-x-6" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

export default function ProfileSettings({
  nome,
  perfil,
  supermercadoId,
  supermercadoNome,
  supermercados,
  setorPrincipal,
  notificacoesAtivas,
  somAtivo,
  tema,
  onSupermercadoChange,
  onSetorPrincipalChange,
  onNotificacoesChange,
  onSomChange,
  onTemaChange,
  onVoltar,
  backLabel = "Voltar",
  showManageUnidadesAction = false,
  onManageUnidades,
  onLogout,
}: ProfileSettingsProps) {
  const isDark = tema === "dark";
  const supermercadosAtivos = supermercados.filter((item) => item.status === "Ativo");

  return (
    <div
      className={cn(
        "min-h-screen transition-colors",
        isDark
          ? "bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_26%),linear-gradient(180deg,#fffdf8_0%,#f8fafc_100%)] text-slate-900"
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div
          className={cn(
            "flex flex-col gap-4 rounded-[32px] border p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6",
            isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/70"
          )}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-2xl text-white shadow-[0_18px_40px_rgba(249,115,22,0.28)]">
              {nome.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onVoltar}
                className={cn(
                  "mb-4 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5",
                  isDark
                    ? "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-slate-500 hover:text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
                )}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  ←
                </span>
                {backLabel}
              </button>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Perfil e configurações</h1>
              <p className={cn("mt-2 max-w-2xl text-sm leading-6", isDark ? "text-slate-400" : "text-slate-500")}>
                Ajuste preferências de uso do app interno de logística e mantenha seu acesso pronto para a rotina de operação.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {showManageUnidadesAction && onManageUnidades && (
              <button
                type="button"
                onClick={onManageUnidades}
                className={cn(
                  "touch-target inline-flex items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all",
                  isDark
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                <span>🏬</span>
                Gerenciar unidades
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6">
            <div
              className={cn(
                "rounded-[32px] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6",
                isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/75"
              )}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight">Dados do usuário</h2>
                  <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                    Informações principais do seu acesso operacional.
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-100 text-amber-700"
                  )}
                >
                  Ativo agora
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Nome", value: nome },
                  { label: "Perfil", value: perfil },
                  { label: "Unidade", value: supermercadoNome ?? "Todas as unidades" },
                  { label: "Setor principal", value: setorPrincipal },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-[24px] border p-4",
                      isDark ? "border-slate-700 bg-slate-900/70" : "border-slate-200/80 bg-slate-50/80"
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {item.label}
                    </p>
                    <p className={cn("mt-2 text-base font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Loja em operação
                </p>
                <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                  Troque a unidade vinculada quando iniciar operação em outra loja.
                </p>
                <select
                  value={supermercadoId ?? ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      void onSupermercadoChange(e.target.value);
                    }
                  }}
                  className={cn(
                    "mt-3 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-4",
                    isDark
                      ? "border-slate-700 bg-slate-900 text-slate-100 focus:border-amber-400/40 focus:ring-amber-500/15"
                      : "border-slate-200 bg-white text-slate-900 focus:border-amber-300 focus:ring-amber-100"
                  )}
                >
                  <option value="" disabled>
                    Selecione a unidade
                  </option>
                  {supermercadosAtivos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({item.codigo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={cn(
                "rounded-[32px] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6",
                isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/75"
              )}
            >
              <h2 className="text-lg font-black tracking-tight">Setor principal</h2>
              <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                Defina o setor em que você atua com mais frequência.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {SETORES.map((setor) => {
                  const selected = setor === setorPrincipal;

                  return (
                    <button
                      key={setor}
                      type="button"
                      onClick={() => onSetorPrincipalChange(setor)}
                      className={cn(
                        "rounded-[24px] border px-4 py-4 text-left transition-all",
                        selected
                          ? isDark
                            ? "border-amber-400/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(249,115,22,0.12))] shadow-[0_16px_34px_rgba(249,115,22,0.14)]"
                            : "border-amber-300 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(249,115,22,0.12))] shadow-[0_16px_34px_rgba(249,115,22,0.14)]"
                          : isDark
                          ? "border-slate-700 bg-slate-900/70 hover:border-slate-600"
                          : "border-slate-200/80 bg-slate-50/80 hover:border-slate-300 hover:bg-white"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={cn("text-sm font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>
                            {setor}
                          </p>
                          <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                            Ajusta sua preferência de operação principal.
                          </p>
                        </div>
                        <span
                          className={cn(
                            "h-3 w-3 rounded-full",
                            selected
                              ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                              : isDark
                              ? "bg-slate-600"
                              : "bg-slate-300"
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div
              className={cn(
                "rounded-[32px] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6",
                isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/75"
              )}
            >
              <h2 className="text-lg font-black tracking-tight">Preferências</h2>
              <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                Controle rápido para notificações, som e aparência.
              </p>

              <div className="mt-5 space-y-3">
                <Toggle
                  enabled={notificacoesAtivas}
                  onChange={onNotificacoesChange}
                  label="Notificações"
                  description="Receber alertas de novos chamados e movimentações operacionais."
                  isDark={isDark}
                />

                <Toggle
                  enabled={somAtivo}
                  onChange={onSomChange}
                  label="Som"
                  description="Ativar áudio para avisos importantes no app."
                  isDark={isDark}
                />
              </div>
            </div>

            <div
              className={cn(
                "rounded-[32px] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6",
                isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/75"
              )}
            >
              <h2 className="text-lg font-black tracking-tight">Tema</h2>
              <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                Escolha o visual que fica melhor para sua rotina.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onTemaChange("light")}
                  className={cn(
                    "rounded-[28px] border p-4 text-left transition-all",
                    tema === "light"
                      ? "border-amber-300 bg-[linear-gradient(180deg,#fffdf8,#f8fafc)] shadow-[0_18px_36px_rgba(249,115,22,0.14)]"
                      : isDark
                      ? "border-slate-700 bg-slate-900/80 hover:border-slate-600"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Claro</span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Padrão
                    </span>
                  </div>
                  <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-3">
                    <div className="h-3 w-16 rounded-full bg-slate-900" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-16 rounded-2xl bg-slate-100" />
                      <div className="h-16 rounded-2xl bg-[linear-gradient(135deg,#fbbf24,#fb923c)]" />
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onTemaChange("dark")}
                  className={cn(
                    "rounded-[28px] border p-4 text-left transition-all",
                    tema === "dark"
                      ? "border-amber-400/30 bg-[linear-gradient(180deg,#0f172a,#020617)] shadow-[0_18px_36px_rgba(15,23,42,0.32)]"
                      : isDark
                      ? "border-slate-700 bg-slate-900/80 hover:border-slate-600"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("text-sm font-semibold", tema === "dark" ? "text-white" : "text-slate-900")}>
                      Escuro
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        tema === "dark" ? "bg-amber-500/15 text-amber-300" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      Contraste
                    </span>
                  </div>
                  <div className="mt-4 rounded-[20px] border border-white/10 bg-slate-950 p-3">
                    <div className="h-3 w-16 rounded-full bg-white/90" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-16 rounded-2xl bg-slate-800" />
                      <div className="h-16 rounded-2xl bg-[linear-gradient(135deg,#1d4ed8,#0f172a)]" />
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div
              className={cn(
                "rounded-[32px] border p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6",
                isDark ? "border-slate-800 bg-slate-950/70" : "border-white/70 bg-white/75"
              )}
            >
              <h2 className="text-lg font-black tracking-tight">Conta e sessão</h2>
              <p className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
                Gerencie sua sessão atual e troque de usuário quando necessário.
              </p>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={onLogout}
                  className={cn(
                    "touch-target inline-flex w-full items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-all sm:w-auto",
                    isDark
                      ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                      : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  )}
                >
                  <span>⎋</span>
                  Trocar usuário
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
