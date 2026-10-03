import type { OperationalForecastSummary } from "../utils/operationalForecast";

interface OperationalForecastPanelProps {
  forecastSummary: OperationalForecastSummary[];
}

const riskToneClass: Record<OperationalForecastSummary["risk"], string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  high: "border-red-200 bg-red-50 text-red-900",
};

const riskLabel: Record<OperationalForecastSummary["risk"], string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

export default function OperationalForecastPanel({
  forecastSummary,
}: OperationalForecastPanelProps) {
  const highRiskCount = forecastSummary.filter((item) => item.risk === "high").length;
  const averageQueueMinutes =
    forecastSummary.length > 0
      ? Math.round(
          forecastSummary.reduce((sum, item) => sum + item.predictedQueueMinutes, 0) /
            forecastSummary.length
        )
      : 0;

  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Previsão operacional</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Carga esperada e risco de fila</h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          Fila média: <span className="font-black text-slate-950">{averageQueueMinutes} min</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Unidades em risco</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{highRiskCount}</p>
          <p className="mt-2 text-sm text-slate-600">com previsão de congestionamento</p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Urgentes abertos</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {forecastSummary.reduce((sum, item) => sum + item.urgentCalls, 0)}
          </p>
          <p className="mt-2 text-sm text-slate-600">prioridades que exigem atenção imediata</p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Cobertura atual</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {forecastSummary.filter((item) => item.openCalls === 0).length}
          </p>
          <p className="mt-2 text-sm text-slate-600">unidades sem backlog ativo</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold">Unidade</th>
                <th className="px-4 py-3 font-bold">Abertos</th>
                <th className="px-4 py-3 font-bold">Urgentes</th>
                <th className="px-4 py-3 font-bold">Média</th>
                <th className="px-4 py-3 font-bold">Fila prevista</th>
                <th className="px-4 py-3 font-bold">Risco</th>
              </tr>
            </thead>
            <tbody>
              {forecastSummary.map((item) => (
                <tr key={item.unitId} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-900">{item.unitName}</td>
                  <td className="px-4 py-3">{item.openCalls}</td>
                  <td className="px-4 py-3">{item.urgentCalls}</td>
                  <td className="px-4 py-3">{item.averageAgeMinutes} min</td>
                  <td className="px-4 py-3">{item.predictedQueueMinutes} min</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${riskToneClass[item.risk]}`}>
                      {riskLabel[item.risk]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Recomendação</p>
        <p className="mt-2 text-sm text-slate-700">
          {forecastSummary[0]?.recommendation ?? "Sem previsão relevante nesta janela."}
        </p>
      </div>
    </section>
  );
}
