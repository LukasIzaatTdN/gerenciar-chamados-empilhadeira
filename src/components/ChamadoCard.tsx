import type { Chamado } from "../types/chamado";
import type { TimeEstimate } from "../hooks/useTimeEstimates";
import TimeEstimateBadge from "./TimeEstimateBadge";

interface ChamadoCardProps {
  chamado: Chamado;
  onIniciar: (id: string) => void;
  onFinalizar: (id: string) => void;
  onExcluir: (id: string) => void;
  estimate?: TimeEstimate;
  remainingMin?: number | null;
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

export default function ChamadoCard({
  chamado,
  onIniciar,
  onFinalizar,
  onExcluir,
  estimate,
  remainingMin,
}: ChamadoCardProps) {
  const isUrgente = chamado.prioridade === "Urgente";
  const isAguardando = chamado.status === "Aguardando";
  const isEmAtendimento = chamado.status === "Em atendimento";
  const isFinalizado = chamado.status === "Finalizado";

  const tipoIcons: Record<string, string> = {
    Descarga: "📦",
    Reposição: "🔄",
    Retirada: "📤",
    Movimentação: "🚚",
  };

  const statusConfig = {
    Aguardando: {
      bg: "bg-amber-100/80",
      text: "text-amber-900",
      dot: "bg-amber-500",
      label: "Aguardando",
      ring: "from-amber-400/90 via-amber-300/80 to-transparent",
    },
    "Em atendimento": {
      bg: "bg-blue-100/80",
      text: "text-blue-900",
      dot: "bg-blue-500",
      label: "Em atendimento",
      ring: "from-blue-500/90 via-cyan-400/80 to-transparent",
    },
    Finalizado: {
      bg: "bg-emerald-100/80",
      text: "text-emerald-900",
      dot: "bg-emerald-500",
      label: "Finalizado",
      ring: "from-emerald-500/90 via-emerald-300/80 to-transparent",
    },
  };

  const status = statusConfig[chamado.status];

  return (
    <div
      className={`group fade-up relative overflow-hidden rounded-[28px] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_36px_rgba(15,23,42,0.09)] ${
        isFinalizado
          ? "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))] opacity-85"
          : isUrgente
          ? "border-red-200 bg-[linear-gradient(145deg,rgba(254,242,242,0.92),rgba(255,255,255,0.96))] shadow-[0_16px_30px_rgba(239,68,68,0.08)]"
          : "border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] shadow-[0_16px_30px_rgba(15,23,42,0.06)]"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${status.ring}`} />
      {/* Urgent indicator */}
      {isUrgente && !isFinalizado && (
        <div className="absolute right-4 top-4 rounded-full bg-red-500/12 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-red-600">
          ALERTA
        </div>
      )}

      <div className="p-4 sm:p-5">
        {/* Top Row: Status + Priority + Time */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full ${status.bg} ${status.text} px-2.5 py-1 text-xs font-semibold shadow-sm`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${isEmAtendimento ? "breathe" : ""}`} />
            {status.label}
          </span>

          {isUrgente && !isFinalizado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm">
              🚨 URGENTE
            </span>
          )}

          <span className="ml-auto text-xs font-medium text-slate-400">
            {formatDateTime(chamado.criado_em)} · {getTimeSince(chamado.criado_em)}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                {tipoIcons[chamado.tipo_servico]}
              </span>
              <h3 className={`text-base font-black tracking-tight ${isFinalizado ? "text-slate-500" : "text-slate-900"}`}>
                {chamado.tipo_servico}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                {chamado.setor}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500">
                {getTimeSince(chamado.criado_em)}
              </span>
            </div>
            <p className={`mt-3 text-sm ${isFinalizado ? "text-slate-400" : "text-slate-500"}`}>
              Solicitante: <span className="font-medium">{chamado.solicitante_nome}</span>
            </p>
            {chamado.operador_nome && (
              <p className={`mt-1 text-sm ${isFinalizado ? "text-slate-400" : "text-indigo-600"}`}>
                👷 Operador: <span className="font-medium">{chamado.operador_nome}</span>
              </p>
            )}

            {/* Timestamps */}
            {chamado.iniciado_em && (
              <p className="mt-2 text-xs font-medium text-blue-600">
                ▶ Iniciado: {formatDateTime(chamado.iniciado_em)}
              </p>
            )}
            {chamado.finalizado_em && chamado.iniciado_em && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                ✓ Finalizado: {formatDateTime(chamado.finalizado_em)} ·
                Duração: {getDuration(chamado.iniciado_em, chamado.finalizado_em)}
              </p>
            )}

            {/* ─── Time Estimate Badge ─── */}
            {!isFinalizado && (
              <TimeEstimateBadge
                estimate={estimate}
                remainingMin={isEmAtendimento ? remainingMin : undefined}
                variant="light"
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:justify-start">
            {isAguardando && (
              <button
                onClick={() => onIniciar(chamado.id)}
                className="touch-target flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(37,99,235,0.24)] transition-all hover:bg-blue-700 active:scale-[0.98] sm:min-w-[132px]"
              >
                ▶ Iniciar
              </button>
            )}
            {isEmAtendimento && (
              <button
                onClick={() => onFinalizar(chamado.id)}
                className="touch-target flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(16,185,129,0.24)] transition-all hover:bg-emerald-700 active:scale-[0.98] sm:min-w-[132px]"
              >
                ✓ Finalizar
              </button>
            )}
            {isFinalizado && (
              <button
                onClick={() => onExcluir(chamado.id)}
                className="touch-target flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 sm:min-w-[112px]"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
