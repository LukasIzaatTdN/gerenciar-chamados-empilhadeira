import { useState, useMemo } from "react";
import type { Chamado, Setor } from "../types/chamado";
import type { AppNotification } from "../types/notification";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import { cn } from "../utils/cn";
import TimeEstimateBadge from "./TimeEstimateBadge";
import NotificationCenter from "./NotificationCenter";

export type OperadorStatus = "Disponível" | "Pausa";

interface OperadorPanelProps {
  chamados: Chamado[];
  operadorNome: string;
  supermercadoNome: string | null;
  operadorStatus: OperadorStatus;
  onStatusChange: (status: OperadorStatus) => void;
  onAssumir: (id: string, operadorNome: string) => void | Promise<void>;
  onIniciar: (id: string, operadorNome: string) => void | Promise<void>;
  onFinalizar: (id: string, operadorNome: string) => void | Promise<void>;
  onVoltar: () => void;
  onLogout: () => void;
  timeEstimates: TimeEstimatesResult;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onSimulateProximo: () => void;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeSince(iso: string): string {
  const now = new Date().getTime();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
  return `${Math.floor(diff / 86400)}d`;
}

function getDuration(start: string, end: string): string {
  const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
}

type FilterTab = "pendentes" | "meus" | "finalizados";

export default function OperadorPanel({
  chamados,
  operadorNome,
  supermercadoNome,
  operadorStatus,
  onStatusChange,
  onAssumir,
  onIniciar,
  onFinalizar,
  onVoltar,
  onLogout,
  timeEstimates,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onSimulateProximo,
}: OperadorPanelProps) {
  const [filterSetor, setFilterSetor] = useState<"Todos" | Setor>("Todos");
  const [activeTab, setActiveTab] = useState<FilterTab>("pendentes");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const isDisponivel = operadorStatus === "Disponível";

  async function runAction(actionId: string, action: () => void | Promise<void>) {
    try {
      setActionError(null);
      setLoadingActionId(actionId);
      await action();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível concluir esta ação agora.";
      setActionError(message);
    } finally {
      setLoadingActionId(null);
    }
  }

  const setoresDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          chamados
            .map((c) => c.setor.trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "pt-BR"))
        )
      ),
    [chamados]
  );

  const pendentes = useMemo(
    () =>
      chamados
        .filter((c) => c.status === "Aguardando" && !c.operador_nome)
        .sort((a, b) => {
          if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
          if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
          return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
        }),
    [chamados]
  );

  const meusChamados = useMemo(
    () =>
      chamados
        .filter((c) => c.operador_nome === operadorNome && c.status !== "Finalizado")
        .sort((a, b) => {
          if (a.status === "Em atendimento" && b.status !== "Em atendimento") return -1;
          if (a.status !== "Em atendimento" && b.status === "Em atendimento") return 1;
          if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
          if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
          return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
        }),
    [chamados, operadorNome]
  );

  const finalizados = useMemo(
    () =>
      chamados
        .filter((c) => c.operador_nome === operadorNome && c.status === "Finalizado")
        .sort((a, b) => new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime()),
    [chamados, operadorNome]
  );

  const applySetorFilter = (list: Chamado[]) =>
    filterSetor === "Todos" ? list : list.filter((c) => c.setor === filterSetor);

  const currentList =
    activeTab === "pendentes"
      ? applySetorFilter(pendentes)
      : activeTab === "meus"
      ? applySetorFilter(meusChamados)
      : applySetorFilter(finalizados);

  const tipoIcons: Record<string, string> = {
    Descarga: "📦",
    Reposição: "🔄",
    Retirada: "📤",
    Movimentação: "🚚",
  };

  const tabs: { key: FilterTab; label: string; count: number; icon: string }[] = [
    { key: "pendentes", label: "Pendentes", count: pendentes.length, icon: "📋" },
    { key: "meus", label: "Meus Chamados", count: meusChamados.length, icon: "👷" },
    { key: "finalizados", label: "Finalizados", count: finalizados.length, icon: "✅" },
  ];

  const totalHojeFinalizados = finalizados.filter((c) => {
    const hoje = new Date().toDateString();
    return c.finalizado_em && new Date(c.finalizado_em).toDateString() === hoje;
  }).length;

  const emAtendimentoAtual = meusChamados.filter((c) => c.status === "Em atendimento").length;
  const chamadoRecomendado = pendentes[0] ?? null;

  return (
    <div className="min-h-screen bg-transparent">
      <header className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,61,117,0.97),rgba(15,23,42,0.95))] shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <span className="text-2xl">👷</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Painel do Operador</h1>
                <p className="text-xs text-slate-200 sm:text-sm">
                  Olá, <span className="font-semibold text-white">{operadorNome}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-300" />
                    Unidade: {supermercadoNome ?? "Unidade não identificada"}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        isDisponivel ? "bg-emerald-400" : "bg-amber-300"
                      )}
                    />
                    Status: {operadorStatus}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300" />
                    Pendentes da unidade: {pendentes.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={onSimulateProximo}
                className="touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/12 px-4 py-3 text-xs font-medium text-amber-100 transition-all hover:bg-amber-400/18 sm:w-auto sm:text-sm"
              >
                <span>📍</span>
                <span>Sinalizar Próximo</span>
              </button>

              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={onMarkAsRead}
                onMarkAllAsRead={onMarkAllAsRead}
                onClearAll={onClearAll}
                variant="light"
              />

              <button
                onClick={onVoltar}
                className="touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-xs font-medium text-white/80 transition-all hover:bg-white/14 hover:text-white sm:w-auto sm:text-sm"
              >
                <span>←</span>
                <span>Painel Geral</span>
              </button>

              <button
                onClick={onLogout}
                className="touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-100 transition-all hover:bg-red-500/16 sm:w-auto sm:text-sm"
              >
                <span>⎋</span>
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Central da unidade
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">
                {supermercadoNome ?? "Unidade não identificada"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Este painel mostra apenas chamados da loja vinculada ao seu usuário.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                  Pendentes
                </p>
                <p className="mt-2 text-2xl font-black text-amber-700">{pendentes.length}</p>
              </div>
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                  Em andamento
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-700">{emAtendimentoAtual}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Status atual
                </p>
                <p className="mt-2 text-lg font-black text-slate-900">{operadorStatus}</p>
              </div>
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Chamado recomendado agora
              </p>
              {chamadoRecomendado ? (
                <>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                    {chamadoRecomendado.tipo_servico} · {chamadoRecomendado.setor}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Solicitante: {chamadoRecomendado.solicitante_nome}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                    Nenhum chamado aguardando nesta unidade
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Quando surgir uma nova solicitação da loja, ela aparecerá aqui.
                  </p>
                </>
              )}
            </div>

            {chamadoRecomendado && (
              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Prioridade:</span>{" "}
                  {chamadoRecomendado.prioridade}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Tempo de espera:</span>{" "}
                  {getTimeSince(chamadoRecomendado.criado_em)}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:col-span-2">
                  <span className="font-semibold text-slate-900">Abertura:</span>{" "}
                  {formatDateTime(chamadoRecomendado.criado_em)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                Status do operador
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Defina rapidamente se você está disponível para assumir novos chamados da sua unidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {(["Disponível", "Pausa"] as OperadorStatus[]).map((status) => {
                const active = operadorStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusChange(status)}
                    className={cn(
                      "touch-target rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                      active
                        ? status === "Disponível"
                          ? "bg-emerald-500 text-white shadow-[0_14px_28px_rgba(16,185,129,0.28)]"
                          : "bg-amber-400 text-slate-950 shadow-[0_14px_28px_rgba(245,158,11,0.28)]"
                        : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
          {!isDisponivel && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Em pausa: você continua vendo os chamados, mas não pode assumir novos atendimentos.
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: "Pendentes", value: pendentes.length, icon: "📋", border: "border-amber-200", text: "text-amber-700", valueText: "text-amber-600" },
            { label: "Atendendo", value: emAtendimentoAtual, icon: "🔧", border: "border-emerald-200", text: "text-emerald-700", valueText: "text-emerald-600" },
            { label: "Hoje", value: totalHojeFinalizados, icon: "✅", border: "border-blue-200", text: "text-blue-800", valueText: "text-blue-700" },
            {
              label: "Tempo Médio",
              value: timeEstimates.mediaMin !== null ? formatEstimateMinutes(timeEstimates.mediaMin) : "—",
              icon: "⏱️",
              border: "border-blue-200",
              text: "text-blue-800",
              valueText: "text-blue-700",
              subtitle:
                timeEstimates.totalFinalizados > 0
                  ? `${timeEstimates.totalFinalizados} atendimento${timeEstimates.totalFinalizados !== 1 ? "s" : ""}`
                  : "sem dados",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-[24px] border bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.06)]",
                item.border
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <span className={cn("text-xs font-semibold sm:text-sm", item.text)}>{item.label}</span>
              </div>
              <p className={cn("mt-1 text-2xl font-bold sm:text-3xl", item.valueText)}>{item.value}</p>
              {"subtitle" in item && item.subtitle && (
                <p className="mt-0.5 text-[10px] text-slate-400">{item.subtitle}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
          <span className="text-xs font-medium text-slate-500">Indicadores:</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-xs text-red-600">Urgente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-700">Aguardando</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700">Em atendimento</span>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "touch-target flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm",
                activeTab === tab.key
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-lg shadow-slate-900/20"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold",
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs font-medium text-slate-500">Filtrar setor:</span>
            <button
              onClick={() => setFilterSetor("Todos")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                filterSetor === "Todos"
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              Todos
            </button>
            {setoresDisponiveis.map((setor) => (
              <button
                key={setor}
                onClick={() => setFilterSetor(setor)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  filterSetor === setor
                    ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                    : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                {setor}
              </button>
            ))}
          </div>
        </div>

        {currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-slate-200 bg-white py-16 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <span className="text-5xl">
              {activeTab === "pendentes" ? "✨" : activeTab === "meus" ? "👷" : "📊"}
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-600">
              {activeTab === "pendentes"
                ? "Nenhum chamado pendente"
                : activeTab === "meus"
                ? "Nenhum chamado assumido"
                : "Nenhum chamado finalizado"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {activeTab === "pendentes"
                ? "Todos os chamados foram atendidos!"
                : activeTab === "meus"
                ? "Assuma chamados na aba Pendentes"
                : "Seus chamados finalizados aparecerão aqui"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentList.map((chamado) => {
              const isUrgente = chamado.prioridade === "Urgente";
              const isAguardando = chamado.status === "Aguardando";
              const isEmAtendimento = chamado.status === "Em atendimento";
              const isFinalizado = chamado.status === "Finalizado";
              const isAssumido = chamado.operador_nome === operadorNome;
              const estimate = timeEstimates.estimates[chamado.id];
              const remainingMin = timeEstimates.tempoRestanteEmAtendimento[chamado.id];

              let indicatorColor = "bg-amber-400";
              if (isUrgente && !isFinalizado) indicatorColor = "bg-red-500";
              else if (isEmAtendimento) indicatorColor = "bg-emerald-500";
              else if (isFinalizado) indicatorColor = "bg-slate-400";

              let cardBorder = "border-slate-200";
              let cardBg = "bg-white";
              if (isUrgente && !isFinalizado) {
                cardBorder = "border-red-200";
                cardBg = "bg-red-50/60";
              } else if (isEmAtendimento) {
                cardBorder = "border-emerald-200";
                cardBg = "bg-emerald-50/60";
              } else if (isFinalizado) {
                cardBorder = "border-slate-200";
                cardBg = "bg-slate-50/70";
              }

              return (
                <div
                  key={chamado.id}
                  className={cn(
                    "group relative overflow-hidden rounded-[26px] border shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)]",
                    cardBorder,
                    cardBg
                  )}
                >
                  <div className={cn("absolute left-0 top-0 h-full w-1.5", indicatorColor)} />

                  {isUrgente && !isFinalizado && (
                    <div className="absolute right-3 top-3">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </span>
                    </div>
                  )}

                  <div className="p-4 pl-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                          isEmAtendimento
                            ? "bg-emerald-100 text-emerald-700"
                            : isFinalizado
                            ? "bg-slate-100 text-slate-500"
                            : isUrgente
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            isEmAtendimento
                              ? "bg-emerald-500"
                              : isFinalizado
                              ? "bg-slate-400"
                              : isUrgente
                              ? "bg-red-500"
                              : "bg-amber-500"
                          )}
                        />
                        {chamado.status}
                      </span>

                      {isUrgente && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                          🚨 URGENTE
                        </span>
                      )}

                      {isAssumido && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          👷 Assumido
                        </span>
                      )}

                      <span className="w-full text-xs text-slate-400 sm:ml-auto sm:w-auto">
                        {formatDateTime(chamado.criado_em)} · {getTimeSince(chamado.criado_em)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">{tipoIcons[chamado.tipo_servico]}</span>
                          <h3 className={cn("text-sm font-bold", isFinalizado ? "text-slate-500" : "text-slate-900")}>
                            {chamado.tipo_servico}
                          </h3>
                          <span className="hidden text-slate-300 sm:inline">•</span>
                          <span
                            className={cn(
                              "rounded-lg px-2 py-0.5 text-xs font-medium",
                              isFinalizado ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-700"
                            )}
                          >
                            📍 {chamado.setor}
                          </span>
                        </div>

                        <p className={cn("mt-1.5 text-xs", isFinalizado ? "text-slate-400" : "text-slate-500")}>
                          Solicitante: <span className="font-medium text-slate-700">{chamado.solicitante_nome}</span>
                        </p>

                        {chamado.iniciado_em && (
                          <p className="mt-1 text-xs text-emerald-700">
                            ▶ Iniciado: {formatDateTime(chamado.iniciado_em)}
                          </p>
                        )}

                        {chamado.finalizado_em && chamado.iniciado_em && (
                          <p className="mt-0.5 text-xs text-blue-700">
                            ✓ Finalizado: {formatDateTime(chamado.finalizado_em)} · Duração:{" "}
                            {getDuration(chamado.iniciado_em, chamado.finalizado_em)}
                          </p>
                        )}

                        {!isFinalizado && (
                          <TimeEstimateBadge
                            estimate={estimate}
                            remainingMin={isEmAtendimento ? remainingMin : undefined}
                            variant="dark"
                          />
                        )}
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                        {isAguardando && !chamado.operador_nome && (
                          <button
                            onClick={() => {
                              void runAction(`assumir-${chamado.id}`, () =>
                                onAssumir(chamado.id, operadorNome)
                              );
                            }}
                            disabled={!isDisponivel || loadingActionId === `assumir-${chamado.id}`}
                            className={cn(
                              "w-full rounded-xl px-4 py-2.5 text-xs font-bold transition-all active:scale-95 sm:w-auto sm:text-sm",
                              isDisponivel
                                ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-lg shadow-slate-900/20 hover:brightness-110"
                                : "cursor-not-allowed bg-slate-100 text-slate-400"
                            )}
                          >
                            {loadingActionId === `assumir-${chamado.id}`
                              ? "Assumindo..."
                              : isDisponivel
                                ? "Assumir"
                                : "Em pausa"}
                          </button>
                        )}

                        {isAguardando && isAssumido && (
                          <button
                            onClick={() => {
                              void runAction(`iniciar-${chamado.id}`, () =>
                                onIniciar(chamado.id, operadorNome)
                              );
                            }}
                            disabled={loadingActionId === `iniciar-${chamado.id}`}
                            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 active:scale-95 sm:w-auto sm:text-sm"
                          >
                            {loadingActionId === `iniciar-${chamado.id}` ? "Iniciando..." : "Iniciar"}
                          </button>
                        )}

                        {isEmAtendimento && isAssumido && (
                          <button
                            onClick={() => {
                              void runAction(`finalizar-${chamado.id}`, () =>
                                onFinalizar(chamado.id, operadorNome)
                              );
                            }}
                            disabled={loadingActionId === `finalizar-${chamado.id}`}
                            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:brightness-105 active:scale-95 sm:w-auto sm:text-sm"
                          >
                            {loadingActionId === `finalizar-${chamado.id}` ? "Finalizando..." : "Finalizar"}
                          </button>
                        )}

                        {isFinalizado && (
                          <span className="w-full rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500 sm:w-auto">
                            Concluído
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Painel do Operador · Sistema de Gerenciamento de Chamados
      </footer>
    </div>
  );
}
