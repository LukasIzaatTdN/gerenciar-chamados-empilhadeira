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
      bg: "bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.92))] border-amber-200/70",
      text: "text-amber-700",
      valueColor: "text-amber-600",
    },
    {
      label: "Em Atendimento",
      value: String(stats.emAtendimento),
      icon: "🔧",
      bg: "bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.92))] border-blue-200/70",
      text: "text-blue-700",
      valueColor: "text-blue-600",
    },
    {
      label: "Finalizados",
      value: String(stats.finalizado),
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
      label: "Tempo Médio",
      value: mediaMin !== null ? formatEstimateMinutes(mediaMin) : "—",
      icon: "⏱️",
      bg: "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] border-indigo-200/70",
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
          className={`fade-up rounded-[26px] border ${card.bg} p-3.5 shadow-[0_16px_32px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)] sm:p-4 ${
            card.label === "Tempo Médio" ? "col-span-2 sm:col-span-1" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/85 text-lg shadow-sm sm:text-xl">{card.icon}</span>
            <span className={`text-xs font-medium ${card.text} sm:text-sm`}>
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
