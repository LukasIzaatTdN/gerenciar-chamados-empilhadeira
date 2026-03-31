import type { TimeEstimate } from "../hooks/useTimeEstimates";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";

interface TimeEstimateBadgeProps {
  estimate: TimeEstimate | undefined;
  remainingMin?: number | null;
  variant?: "light" | "dark";
}

export default function TimeEstimateBadge({
  estimate,
  remainingMin,
  variant = "light",
}: TimeEstimateBadgeProps) {
  if (!estimate) return null;

  const isDark = variant === "dark";

  const hasEstimate = estimate.tempoEstimadoMin !== null;
  const hasQueue = estimate.suaVezEmMin !== null;
  const hasRemaining = remainingMin !== null && remainingMin !== undefined;

  if (!hasEstimate && !hasQueue && !hasRemaining) return null;

  return (
    <div
      className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
        isDark
          ? "bg-white border border-slate-200"
          : "bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100"
      }`}
    >
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-blue-700" : "text-blue-500"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      {/* Tempo estimado de serviço */}
      {hasEstimate && (
        <span
          className={`text-xs font-medium ${
            isDark ? "text-blue-700" : "text-blue-600"
          }`}
        >
          Tempo estimado:{" "}
          <span className={`font-bold ${isDark ? "text-blue-900" : "text-blue-700"}`}>
            {formatEstimateMinutes(estimate.tempoEstimadoMin!)}
          </span>
        </span>
      )}

      {/* Separator */}
      {hasEstimate && (hasQueue || hasRemaining) && (
        <span className={`text-xs ${isDark ? "text-slate-300" : "text-gray-300"}`}>
          •
        </span>
      )}

      {/* Sua vez em */}
      {hasQueue && (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            isDark ? "text-amber-700" : "text-amber-600"
          }`}
        >
          {estimate.suaVezEmMin === 0 ? (
            <>
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                    isDark ? "bg-emerald-500" : "bg-emerald-500"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isDark ? "bg-emerald-500" : "bg-emerald-500"
                  }`}
                />
              </span>
              <span className={`font-bold ${isDark ? "text-emerald-700" : "text-emerald-600"}`}>
                Próximo na fila!
              </span>
            </>
          ) : (
            <>
              Sua vez em aprox.{" "}
              <span className={`font-bold ${isDark ? "text-amber-800" : "text-amber-700"}`}>
                {formatEstimateMinutes(estimate.suaVezEmMin!)}
              </span>
            </>
          )}
        </span>
      )}

      {/* Remaining time for in-progress */}
      {hasRemaining && (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            isDark ? "text-emerald-700" : "text-emerald-600"
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                isDark ? "bg-emerald-500" : "bg-emerald-500"
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isDark ? "bg-emerald-500" : "bg-emerald-500"
              }`}
            />
          </span>
          {remainingMin === 0 ? (
            <span className="font-bold">Concluindo...</span>
          ) : (
            <>
              Restante estimado:{" "}
              <span className={`font-bold ${isDark ? "text-emerald-800" : "text-emerald-700"}`}>
                ~{formatEstimateMinutes(remainingMin!)}
              </span>
            </>
          )}
        </span>
      )}

      {/* Queue position */}
      {estimate.posicaoFila !== null && (
        <>
          <span className={`text-xs ${isDark ? "text-slate-300" : "text-gray-300"}`}>
            •
          </span>
          <span
            className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}
          >
            #{estimate.posicaoFila} na fila
          </span>
        </>
      )}
    </div>
  );
}
