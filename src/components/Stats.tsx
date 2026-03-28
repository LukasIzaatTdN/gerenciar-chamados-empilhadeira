import { formatEstimateMinutes } from "../hooks/useTimeEstimates";

interface StatsProps {
  stats: {
    total: number;
    aguardando: number;
    emAtendimento: number;
    finalizado: number;
    urgentes: number;
  };
  mediaMin: number | null;
  totalFinalizadosComTempo: number;
}

export default function Stats({ stats, mediaMin, totalFinalizadosComTempo }: StatsProps) {
  const cards = [
    {
      label: "Aguardando",
      value: String(stats.aguardando),
      icon: "⏳",
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-700",
      valueColor: "text-amber-600",
    },
    {
      label: "Em Atendimento",
      value: String(stats.emAtendimento),
      icon: "🔧",
      bg: "bg-blue-50 border-blue-200",
      text: "text-blue-700",
      valueColor: "text-blue-600",
    },
    {
      label: "Finalizados",
      value: String(stats.finalizado),
      icon: "✅",
      bg: "bg-emerald-50 border-emerald-200",
      text: "text-emerald-700",
      valueColor: "text-emerald-600",
    },
    {
      label: "Urgentes",
      value: String(stats.urgentes),
      icon: "🚨",
      bg: "bg-red-50 border-red-200",
      text: "text-red-700",
      valueColor: "text-red-600",
    },
    {
      label: "Tempo Médio",
      value: mediaMin !== null ? formatEstimateMinutes(mediaMin) : "—",
      icon: "⏱️",
      bg: "bg-indigo-50 border-indigo-200",
      text: "text-indigo-700",
      valueColor: "text-indigo-600",
      subtitle:
        totalFinalizadosComTempo > 0
          ? `baseado em ${totalFinalizadosComTempo} atendimento${totalFinalizadosComTempo !== 1 ? "s" : ""}`
          : "sem dados ainda",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border ${card.bg} p-3 sm:p-4 transition-all hover:shadow-md ${
            card.label === "Tempo Médio" ? "col-span-2 sm:col-span-1" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg sm:text-xl">{card.icon}</span>
            <span className={`text-xs font-medium ${card.text} sm:text-sm`}>
              {card.label}
            </span>
          </div>
          <p className={`mt-1 text-2xl font-bold ${card.valueColor} sm:text-3xl`}>
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
