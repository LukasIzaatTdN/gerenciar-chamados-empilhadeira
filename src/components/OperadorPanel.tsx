import { useState, useMemo } from "react";
import type { Chamado, Setor } from "../types/chamado";
import type { AppNotification } from "../types/notification";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import TimeEstimateBadge from "./TimeEstimateBadge";
import NotificationCenter from "./NotificationCenter";

interface OperadorPanelProps {
  chamados: Chamado[];
  operadorNome: string;
  onAssumir: (id: string, operadorNome: string) => void;
  onIniciar: (id: string) => void;
  onFinalizar: (id: string) => void;
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

  // Categorize chamados
  const pendentes = useMemo(
    () =>
      chamados
        .filter(
          (c) =>
            c.status === "Aguardando" &&
            !c.operador_nome
        )
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
        .filter(
          (c) =>
            c.operador_nome === operadorNome &&
            c.status !== "Finalizado"
        )
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
        .filter(
          (c) =>
            c.operador_nome === operadorNome &&
            c.status === "Finalizado"
        )
        .sort((a, b) => new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime()),
    [chamados, operadorNome]
  );

  // Apply sector filter
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

  // Stats for operator
  const totalHojeFinalizados = finalizados.filter((c) => {
    const hoje = new Date().toDateString();
    return c.finalizado_em && new Date(c.finalizado_em).toDateString() === hoje;
  }).length;

  const emAtendimentoAtual = meusChamados.filter((c) => c.status === "Em atendimento").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900">
      {/* Operator Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
                <span className="text-2xl">👷</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  Painel do Operador
                </h1>
                <p className="text-xs text-indigo-300 sm:text-sm">
                  Olá, <span className="font-semibold text-indigo-200">{operadorNome}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Simulate nearby */}
              <button
                onClick={onSimulateProximo}
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-300 transition-all hover:bg-amber-500/20 hover:text-amber-200 active:scale-95 sm:px-4 sm:text-sm"
                title="Simular que o operador está próximo ao setor"
              >
                <span>📍</span>
                <span className="hidden sm:inline">Sinalizar Próximo</span>
              </button>

              {/* Notification Center */}
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={onMarkAsRead}
                onMarkAllAsRead={onMarkAllAsRead}
                onClearAll={onClearAll}
                variant="dark"
              />

              <button
                onClick={onVoltar}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white sm:px-4 sm:text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                <span className="hidden sm:inline">Painel Geral</span>
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/20 hover:text-red-200 sm:px-4 sm:text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Operator Quick Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span className="text-xs font-medium text-amber-300 sm:text-sm">Pendentes</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-amber-400 sm:text-3xl">{pendentes.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔧</span>
              <span className="text-xs font-medium text-emerald-300 sm:text-sm">Atendendo</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-emerald-400 sm:text-3xl">{emAtendimentoAtual}</p>
          </div>
          <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">✅</span>
              <span className="text-xs font-medium text-indigo-300 sm:text-sm">Hoje</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-indigo-400 sm:text-3xl">{totalHojeFinalizados}</p>
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏱️</span>
              <span className="text-xs font-medium text-cyan-300 sm:text-sm">Tempo Médio</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-cyan-400 sm:text-3xl">
              {timeEstimates.mediaMin !== null
                ? formatEstimateMinutes(timeEstimates.mediaMin)
                : "—"}
            </p>
            <p className="mt-0.5 text-[10px] text-cyan-400/40">
              {timeEstimates.totalFinalizados > 0
                ? `${timeEstimates.totalFinalizados} atendimento${timeEstimates.totalFinalizados !== 1 ? "s" : ""}`
                : "sem dados"}
            </p>
          </div>
        </div>

        {/* Color Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-xs font-medium text-white/50">Indicadores:</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/30" />
            <span className="text-xs text-red-300">Urgente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/30" />
            <span className="text-xs text-amber-300">Aguardando</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />
            <span className="text-xs text-emerald-300">Em atendimento</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                activeTab === tab.key
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  activeTab === tab.key
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Sector Filter */}
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs font-medium text-white/40">Filtrar setor:</span>
            <button
              onClick={() => setFilterSetor("Todos")}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filterSetor === "Todos"
                  ? "bg-white/20 text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              Todos
            </button>
            {setoresDisponiveis.map((setor) => (
              <button
                key={setor}
                onClick={() => setFilterSetor(setor)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  filterSetor === setor
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                }`}
              >
                {setor}
              </button>
            ))}
          </div>
        </div>

        {/* Chamado List */}
        {currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-white/5 py-16">
            <span className="text-5xl">
              {activeTab === "pendentes" ? "✨" : activeTab === "meus" ? "👷" : "📊"}
            </span>
            <p className="mt-4 text-sm font-semibold text-white/40">
              {activeTab === "pendentes"
                ? "Nenhum chamado pendente"
                : activeTab === "meus"
                ? "Nenhum chamado assumido"
                : "Nenhum chamado finalizado"}
            </p>
            <p className="mt-1 text-xs text-white/20">
              {activeTab === "pendentes"
                ? "Todos os chamados foram atendidos!"
                : activeTab === "meus"
                ? "Assuma chamados da aba Pendentes"
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

              // Visual indicator color
              let indicatorColor = "bg-amber-400 shadow-amber-400/40"; // yellow = aguardando
              if (isUrgente && !isFinalizado) {
                indicatorColor = "bg-red-500 shadow-red-500/40"; // red = urgente
              } else if (isEmAtendimento) {
                indicatorColor = "bg-emerald-400 shadow-emerald-400/40"; // green = em atendimento
              } else if (isFinalizado) {
                indicatorColor = "bg-slate-500 shadow-none";
              }

              // Card border color
              let cardBorder = "border-white/10";
              let cardBg = "bg-white/5";
              if (isUrgente && !isFinalizado) {
                cardBorder = "border-red-500/30";
                cardBg = "bg-red-500/5";
              } else if (isEmAtendimento) {
                cardBorder = "border-emerald-500/30";
                cardBg = "bg-emerald-500/5";
              } else if (isFinalizado) {
                cardBorder = "border-white/5";
                cardBg = "bg-white/[0.02]";
              }

              return (
                <div
                  key={chamado.id}
                  className={`group relative overflow-hidden rounded-xl border ${cardBorder} ${cardBg} transition-all hover:bg-white/10`}
                >
                  {/* Left Indicator Bar */}
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${indicatorColor} shadow-lg`} />

                  {/* Urgente pulse */}
                  {isUrgente && !isFinalizado && (
                    <div className="absolute right-3 top-3">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </span>
                    </div>
                  )}

                  <div className="p-4 pl-5">
                    {/* Top: Status badges + time */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {/* Status indicator dot + text */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isEmAtendimento
                            ? "bg-emerald-500/20 text-emerald-300"
                            : isFinalizado
                            ? "bg-white/10 text-white/40"
                            : isUrgente
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isEmAtendimento
                              ? "bg-emerald-400 animate-pulse"
                              : isFinalizado
                              ? "bg-white/30"
                              : isUrgente
                              ? "bg-red-400"
                              : "bg-amber-400"
                          }`}
                        />
                        {chamado.status}
                      </span>

                      {isUrgente && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-300">
                          🚨 URGENTE
                        </span>
                      )}

                      {isAssumido && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
                          👷 Assumido
                        </span>
                      )}

                      <span className="ml-auto text-xs text-white/30">
                        {formatDateTime(chamado.criado_em)} · {getTimeSince(chamado.criado_em)}
                      </span>
                    </div>

                    {/* Main Info */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{tipoIcons[chamado.tipo_servico]}</span>
                          <h3 className={`text-sm font-bold ${isFinalizado ? "text-white/40" : "text-white"}`}>
                            {chamado.tipo_servico}
                          </h3>
                          <span className="text-white/20">•</span>
                          <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                            isFinalizado
                              ? "bg-white/5 text-white/30"
                              : "bg-white/10 text-white/70"
                          }`}>
                            📍 {chamado.setor}
                          </span>
                        </div>

                        <p className={`mt-1.5 text-xs ${isFinalizado ? "text-white/25" : "text-white/50"}`}>
                          Solicitante: <span className="font-medium text-white/70">{chamado.solicitante_nome}</span>
                        </p>

                        {/* Timestamps */}
                        {chamado.iniciado_em && (
                          <p className="mt-1 text-xs text-emerald-400/70">
                            ▶ Iniciado: {formatDateTime(chamado.iniciado_em)}
                          </p>
                        )}
                        {chamado.finalizado_em && chamado.iniciado_em && (
                          <p className="mt-0.5 text-xs text-indigo-400/70">
                            ✓ Finalizado: {formatDateTime(chamado.finalizado_em)} ·
                            Duração: {getDuration(chamado.iniciado_em, chamado.finalizado_em)}
                          </p>
                        )}

                        {/* ─── Time Estimate Badge ─── */}
                        {!isFinalizado && (
                          <TimeEstimateBadge
                            estimate={estimate}
                            remainingMin={isEmAtendimento ? remainingMin : undefined}
                            variant="dark"
                          />
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                        {/* Assumir - only for pending, unassigned chamados */}
                        {isAguardando && !chamado.operador_nome && (
                          <button
                            onClick={() => onAssumir(chamado.id, operadorNome)}
                            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-95 sm:text-sm"
                          >
                            🤚 Assumir
                          </button>
                        )}

                        {/* Iniciar - only for chamados assumed by this operator */}
                        {isAguardando && isAssumido && (
                          <button
                            onClick={() => onIniciar(chamado.id)}
                            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-95 sm:text-sm"
                          >
                            ▶ Iniciar
                          </button>
                        )}

                        {/* Finalizar - only for chamados in progress by this operator */}
                        {isEmAtendimento && isAssumido && (
                          <button
                            onClick={() => onFinalizar(chamado.id)}
                            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-400 hover:to-teal-400 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-95 sm:text-sm"
                          >
                            ✓ Finalizar
                          </button>
                        )}

                        {isFinalizado && (
                          <span className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white/30">
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

      {/* Footer */}
      <footer className="mt-8 border-t border-white/5 py-4 text-center text-xs text-white/20">
        Painel do Operador · Sistema de Gerenciamento de Chamados
      </footer>
    </div>
  );
}
