import type { Chamado } from "../types/chamado";
import { formatMinutesLabel, getAverageChamadoMetrics } from "../utils/chamadoMetrics";

interface ChamadoTimeMetricsPanelProps {
  chamados: Chamado[];
  title?: string;
  subtitle?: string;
}

export default function ChamadoTimeMetricsPanel({
  chamados,
  title = "Tempos por etapa",
  subtitle = "Média dos principais intervalos operacionais no recorte atual.",
}: ChamadoTimeMetricsPanelProps) {
  const metrics = getAverageChamadoMetrics(chamados);

  const cards = [
    { label: "Para assumir", value: metrics.tempoParaAssumir, tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { label: "Até sair a caminho", value: metrics.tempoAteACaminho, tone: "text-blue-700 bg-blue-50 border-blue-200" },
    { label: "Até chegar", value: metrics.tempoAteChegar, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    { label: "Atendimento", value: metrics.tempoAtendimento, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { label: "Tempo total", value: metrics.tempoTotalChamado, tone: "text-slate-900 bg-slate-50 border-slate-200" },
  ];

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-[24px] border p-4 ${card.tone}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{card.label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight">{formatMinutesLabel(card.value)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
