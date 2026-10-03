import type { OperationalEscalationSummary } from "../utils/operationalEscalation";

interface OperationalEscalationPanelProps {
  escalationSummary: OperationalEscalationSummary[];
}

const severityToneClass: Record<OperationalEscalationSummary["severity"], string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

const severityLabel: Record<OperationalEscalationSummary["severity"], string> = {
  low: "Baixo",
  medium: "Médio",
  critical: "Crítico",
};

export default function OperationalEscalationPanel({
  escalationSummary,
}: OperationalEscalationPanelProps) {
  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Escala de ação</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Ações automáticas recomendadas</h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {escalationSummary.filter((item) => item.severity !== "low").length} com atenção
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {escalationSummary.map((item) => (
          <div key={item.unitId} className={`rounded-[24px] border p-4 ${severityToneClass[item.severity]}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-black tracking-tight text-slate-900">{item.unitName}</span>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${severityToneClass[item.severity]}`}>
                {severityLabel[item.severity]}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-700">
              <div className="rounded-xl bg-white/70 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Abertos</div>
                <div className="mt-1 text-lg font-black text-slate-900">{item.openCalls}</div>
              </div>
              <div className="rounded-xl bg-white/70 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Urg.</div>
                <div className="mt-1 text-lg font-black text-slate-900">{item.urgentCalls}</div>
              </div>
              <div className="rounded-xl bg-white/70 px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Atras.</div>
                <div className="mt-1 text-lg font-black text-slate-900">{item.delayedCalls}</div>
              </div>
            </div>

            <p className="mt-3 text-sm font-medium text-slate-800">{item.action}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
