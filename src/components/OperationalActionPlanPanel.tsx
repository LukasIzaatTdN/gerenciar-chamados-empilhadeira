import type { OperationalActionPlanItem } from "../utils/operationalActionPlan";

interface OperationalActionPlanPanelProps {
  actions: OperationalActionPlanItem[];
}

const toneClassName: Record<OperationalActionPlanItem["priority"], string> = {
  high: "border-red-200 bg-red-50 text-red-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export default function OperationalActionPlanPanel({ actions }: OperationalActionPlanPanelProps) {
  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Plano de ação</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Prioridades recomendadas</h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {actions.length} foco{actions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {actions.map((action) => (
          <div key={action.id} className={`rounded-[24px] border p-4 ${toneClassName[action.priority]}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">
                {action.priority === "high" ? "Alta" : action.priority === "medium" ? "Média" : "Baixa"}
              </span>
              <span className="text-xl font-black tracking-tight">{action.count}</span>
            </div>

            <p className="mt-3 text-lg font-black tracking-tight">{action.title}</p>
            <p className="mt-2 text-sm opacity-80">{action.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
