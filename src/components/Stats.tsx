import { formatEstimateMinutes } from "../hooks/useTimeEstimates";

interface StatsProps {
  stats: {
    aguardando: number;
    emAtendimento: number;
    finalizadosHoje: number;
    urgentes: number;
    setorMaisAcionado: string;
  };
  mediaMin: number | null;
  totalFinalizadosComTempo: number;
  finalizadosLabel?: string;
}

export default function Stats({
  stats,
  mediaMin,
  totalFinalizadosComTempo,
  finalizadosLabel = "Finalizados Hoje",
}: StatsProps) {
  const cards = [
    {
      label: "Aguardando",
      value: String(stats.aguardando),
      icon: "⏳",
      bg: "bg-[linear-gradient(145deg,rgba(255,251,235,0.98),rgba(255,255,255,0.98))] border-amber-200",
      text: "text-amber-700",
      valueColor: "text-amber-600",
    },
    {
      label: "Em Atendimento",
      value: String(stats.emAtendimento),
      icon: "🔧",
      bg: "bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))] border-emerald-200",
      text: "text-emerald-700",
      valueColor: "text-emerald-600",
    },
    {
      label: finalizadosLabel,
      value: String(stats.finalizadosHoje),
      icon: "✅",
      bg: "bg-[linear-gradient(145deg,rgba(236,253,245,0.96),rgba(255,255,255,0.92))] border-emerald-200/70",
      text: "text-emerald-700",
      valueColor: "text-emerald-600",
    },
    {
      label: "Urgentes",
      value: String(stats.urgentes),
      icon: "🚨",
      bg: "bg-[linear-gradient(145deg,rgba(254,242,242,0.96),rgba(255,255,255,0.92))] border-red-200/70",
      text: "text-red-700",
      valueColor: "text-red-600",
    },
    {
      label: "Setor Mais Acionado",
      value: stats.setorMaisAcionado,
      icon: "📍",
      bg: "bg-[linear-gradient(145deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))] border-slate-200",
      text: "text-slate-700",
      valueColor: "text-slate-800",
      subtitle: stats.setorMaisAcionado === "Sem dados" ? "nenhuma solicitação ainda" : "maior demanda do período",
    },
    {
      label: "Tempo Médio",
      value: mediaMin !== null ? formatEstimateMinutes(mediaMin) : "—",
      icon: "⏱️",
      bg: "bg-[linear-gradient(145deg,rgba(239,246,255,0.98),rgba(255,255,255,0.98))] border-blue-200",
      text: "text-blue-800",
      valueColor: "text-blue-700",
      subtitle:
        totalFinalizadosComTempo > 0
          ? `baseado em ${totalFinalizadosComTempo} atendimento${totalFinalizadosComTempo !== 1 ? "s" : ""}`
          : "sem dados ainda",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 sm:gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`fade-up rounded-[28px] border ${card.bg} p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)] sm:p-5 ${
            card.label === "Tempo Médio" || card.label === "Setor Mais Acionado"
              ? "col-span-2 lg:col-span-1"
              : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:text-xl">{card.icon}</span>
            <span className={`text-xs font-semibold ${card.text} sm:text-sm`}>
              {card.label}
            </span>
          </div>
          <p className={`mt-3 text-2xl font-black tracking-tight ${card.valueColor} sm:text-3xl`}>
            {card.value}
          </p>
          {"subtitle" in card && card.subtitle && (
            <p className="mt-0.5 text-[10px] text-gray-400">{card.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
}
