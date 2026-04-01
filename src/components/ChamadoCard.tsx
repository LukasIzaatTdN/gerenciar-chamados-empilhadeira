import type { Chamado } from "../types/chamado";
import { getSupermercadoById } from "../data/supermercados";
import type { TimeEstimate } from "../hooks/useTimeEstimates";
import TimeEstimateBadge from "./TimeEstimateBadge";

interface ChamadoCardProps {
  chamado: Chamado;
  estimate?: TimeEstimate;
  remainingMin?: number | null;
  showSupermercado?: boolean;
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

function getPrioridadeTone(prioridade: Chamado["prioridade"]) {
  return prioridade === "Urgente"
    ? "bg-red-100 text-red-700"
    : "bg-amber-100 text-amber-700";
}

export default function ChamadoCard({
  chamado,
  estimate,
  remainingMin,
  showSupermercado = false,
}: ChamadoCardProps) {
  const isUrgente = chamado.prioridade === "Urgente";
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
      text: "text-amber-900",
      dot: "bg-amber-500",
      label: "Aguardando",
      ring: "from-amber-400/90 via-amber-300/80 to-transparent",
    },
    "Em atendimento": {
      bg: "bg-emerald-100",
      text: "text-emerald-900",
      dot: "bg-emerald-500",
      label: "Em atendimento",
      ring: "from-emerald-500/90 via-emerald-300/80 to-transparent",
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
  const supermercado = getSupermercadoById(chamado.supermercado_id);

  const atualizacoes = [
    {
      label: "Solicitado",
      value: `${formatDateTime(chamado.criado_em)} · ${getTimeSince(chamado.criado_em)}`,
      tone: "text-slate-500",
      dot: "bg-amber-500",
      icon: "📝",
    },
    ...(chamado.operador_nome
      ? [
          {
            label: "Assumido por",
            value: chamado.operador_nome,
            tone: "text-indigo-600",
            dot: "bg-indigo-500",
            icon: "👷",
          },
        ]
      : []),
    ...(chamado.iniciado_em
      ? [
          {
            label: "Atendimento iniciado",
            value: formatDateTime(chamado.iniciado_em),
            tone: "text-blue-600",
            dot: "bg-blue-500",
            icon: "▶",
          },
        ]
      : []),
    ...(chamado.finalizado_em && chamado.iniciado_em
      ? [
          {
            label: "Finalizado",
            value: `${formatDateTime(chamado.finalizado_em)} · duracao ${getDuration(
              chamado.iniciado_em,
              chamado.finalizado_em
            )}`,
            tone: "text-emerald-600",
            dot: "bg-emerald-500",
            icon: "✓",
          },
        ]
      : []),
  ];

  const ultimaAtualizacao = atualizacoes[atualizacoes.length - 1];

  return (
    <div
      className={`group fade-up relative overflow-hidden rounded-[28px] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_36px_rgba(15,23,42,0.09)] ${
        isFinalizado
          ? "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] opacity-90"
          : isUrgente
          ? "border-red-200 bg-[linear-gradient(145deg,rgba(254,242,242,0.96),rgba(255,255,255,0.98))] shadow-[0_16px_30px_rgba(239,68,68,0.08)]"
          : "border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
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

          <span className="w-full text-xs font-medium text-slate-400 sm:ml-auto sm:w-auto">
            Ultima atualizacao: {ultimaAtualizacao.value}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex flex-col gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg shadow-[0_8px_16px_rgba(15,23,42,0.08)]">
                {tipoIcons[chamado.tipo_servico]}
              </span>
              <h3 className={`text-base font-black tracking-tight ${isFinalizado ? "text-slate-500" : "text-slate-900"}`}>
                {chamado.tipo_servico}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Setor: {chamado.setor}
              </span>
              <span className={`rounded-full px-2.5 py-1 font-semibold ${getPrioridadeTone(chamado.prioridade)}`}>
                Prioridade: {chamado.prioridade}
              </span>
              {showSupermercado && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                  {supermercado?.nome ?? "Unidade não identificada"}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500">
                Abertura: {formatDateTime(chamado.criado_em)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500">
                Espera: {getTimeSince(chamado.criado_em)}
              </span>
            </div>
            <p className={`mt-3 text-sm ${isFinalizado ? "text-slate-400" : "text-slate-500"}`}>
              Solicitante: <span className="font-medium">{chamado.solicitante_nome}</span>
            </p>

            {/* ─── Time Estimate Badge ─── */}
            {!isFinalizado && (
              <TimeEstimateBadge
                estimate={estimate}
                remainingMin={isEmAtendimento ? remainingMin : undefined}
                variant="light"
              />
            )}
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm">📡</span>
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Linha do tempo
              </h4>
            </div>
            <div className="space-y-0">
              {atualizacoes.map((atualizacao, index) => {
                const isLast = index === atualizacoes.length - 1;

                return (
                  <div
                    key={`${chamado.id}-${atualizacao.label}`}
                    className="grid grid-cols-[22px_1fr] gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${atualizacao.dot}`}
                      >
                        {atualizacao.icon}
                      </span>
                      {!isLast && (
                        <span className="mt-1 h-full min-h-6 w-px bg-slate-200" />
                      )}
                    </div>
                    <div className={`pb-3 ${!isLast ? "border-b border-slate-200/80" : ""}`}>
                      <p className="text-xs font-semibold text-slate-700">{atualizacao.label}</p>
                      <p className={`mt-0.5 text-xs ${atualizacao.tone}`}>{atualizacao.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
