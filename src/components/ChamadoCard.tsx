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
      bg: "bg-amber-100",
      text: "text-amber-800",
      dot: "bg-amber-500",
      label: "Aguardando",
    },
    "Em atendimento": {
      bg: "bg-blue-100",
      text: "text-blue-800",
      dot: "bg-blue-500",
      label: "Em atendimento",
    },
    Finalizado: {
      bg: "bg-emerald-100",
      text: "text-emerald-800",
      dot: "bg-emerald-500",
      label: "Finalizado",
    },
  };

  const status = statusConfig[chamado.status];

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all hover:shadow-md ${
        isFinalizado
          ? "border-gray-200 bg-gray-50 opacity-70"
          : isUrgente
          ? "border-red-200 bg-gradient-to-r from-red-50 to-white shadow-sm"
          : "border-gray-200 bg-white shadow-sm"
      }`}
    >
      {/* Urgent indicator */}
      {isUrgente && !isFinalizado && (
        <div className="absolute left-0 top-0 h-full w-1 bg-red-500" />
      )}

      <div className="p-4">
        {/* Top Row: Status + Priority + Time */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full ${status.bg} ${status.text} px-2.5 py-1 text-xs font-semibold`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${isEmAtendimento ? "animate-pulse" : ""}`} />
            {status.label}
          </span>

          {isUrgente && !isFinalizado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
              🚨 URGENTE
            </span>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {formatDateTime(chamado.criado_em)} · {getTimeSince(chamado.criado_em)}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">{tipoIcons[chamado.tipo_servico]}</span>
              <h3 className={`text-sm font-bold ${isFinalizado ? "text-gray-500" : "text-gray-800"}`}>
                {chamado.tipo_servico}
              </h3>
              <span className="text-xs text-gray-400">•</span>
              <span className={`text-sm ${isFinalizado ? "text-gray-400" : "text-gray-600"}`}>
                {chamado.setor}
              </span>
            </div>
            <p className={`mt-1 text-xs ${isFinalizado ? "text-gray-400" : "text-gray-500"}`}>
              Solicitante: <span className="font-medium">{chamado.solicitante_nome}</span>
            </p>
            {chamado.operador_nome && (
              <p className={`mt-0.5 text-xs ${isFinalizado ? "text-gray-400" : "text-indigo-500"}`}>
                👷 Operador: <span className="font-medium">{chamado.operador_nome}</span>
              </p>
            )}

            {/* Timestamps */}
            {chamado.iniciado_em && (
              <p className="mt-1 text-xs text-blue-500">
                ▶ Iniciado: {formatDateTime(chamado.iniciado_em)}
              </p>
            )}
            {chamado.finalizado_em && chamado.iniciado_em && (
              <p className="mt-0.5 text-xs text-emerald-500">
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
          <div className="flex shrink-0 items-center gap-2">
            {isAguardando && (
              <button
                onClick={() => onIniciar(chamado.id)}
                className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white shadow transition-all hover:bg-blue-600 hover:shadow-md active:scale-95"
              >
                ▶ Iniciar
              </button>
            )}
            {isEmAtendimento && (
              <button
                onClick={() => onFinalizar(chamado.id)}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow transition-all hover:bg-emerald-600 hover:shadow-md active:scale-95"
              >
                ✓ Finalizar
              </button>
            )}
            {isFinalizado && (
              <button
                onClick={() => onExcluir(chamado.id)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500"
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
