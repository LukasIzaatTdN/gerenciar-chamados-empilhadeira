import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

interface AdminExecutiveSummaryProps {
  chamados: Chamado[];
  supermercados: Supermercado[];
  selectedSupermercadoId: string | null;
  isConsolidated: boolean;
}

function getMediaMin(chamados: Chamado[]) {
  const finalizados = chamados.filter(
    (chamado) => chamado.status === "Finalizado" && chamado.iniciado_em && chamado.finalizado_em
  );

  if (finalizados.length === 0) return null;

  const total = finalizados.reduce((acc, chamado) => {
    return (
      acc +
      (new Date(chamado.finalizado_em!).getTime() - new Date(chamado.iniciado_em!).getTime())
    );
  }, 0);

  return Math.max(1, Math.round(total / finalizados.length / 60000));
}

export default function AdminExecutiveSummary({
  chamados,
  supermercados,
  selectedSupermercadoId,
  isConsolidated,
}: AdminExecutiveSummaryProps) {
  const unidadesBase = supermercados.filter(
    (item) => isConsolidated || item.id === selectedSupermercadoId
  );

  const unidadesComResumo = unidadesBase
    .map((supermercado) => {
      const chamadosUnidade = chamados.filter((chamado) => chamado.supermercado_id === supermercado.id);
      const aguardando = chamadosUnidade.filter((chamado) => chamado.status === "Aguardando").length;
      const urgentes = chamadosUnidade.filter(
        (chamado) => chamado.prioridade === "Urgente" && chamado.status !== "Finalizado"
      ).length;
      const mediaMin = getMediaMin(chamadosUnidade);

      return {
        supermercado,
        aguardando,
        urgentes,
        mediaMin,
        total: chamadosUnidade.length,
      };
    })
    .sort((a, b) => {
      if (b.aguardando !== a.aguardando) return b.aguardando - a.aguardando;
      if (b.urgentes !== a.urgentes) return b.urgentes - a.urgentes;
      return b.total - a.total;
    });

  const unidadesAtivas = unidadesBase.filter((item) => item.status === "Ativo").length;
  const unidadesComFila = unidadesComResumo.filter((item) => item.aguardando > 0).length;
  const unidadesComUrgencia = unidadesComResumo.filter((item) => item.urgentes > 0).length;
  const unidadeMaisPressionada = unidadesComResumo[0] ?? null;
  const unidadeMaisRapida = [...unidadesComResumo]
    .filter((item) => item.mediaMin !== null)
    .sort((a, b) => (a.mediaMin ?? Number.MAX_SAFE_INTEGER) - (b.mediaMin ?? Number.MAX_SAFE_INTEGER))[0] ?? null;

  const overviewCards = [
    {
      label: isConsolidated ? "Unidades monitoradas" : "Unidade em foco",
      value: String(unidadesBase.length),
      description: `${unidadesAtivas} ${unidadesAtivas === 1 ? "unidade ativa" : "unidades ativas"} no recorte atual`,
      tone: "border-slate-200 bg-white text-slate-900",
    },
    {
      label: "Lojas com fila",
      value: String(unidadesComFila),
      description: "unidades com chamados aguardando agora",
      tone: "border-amber-200 bg-amber-50/80 text-amber-900",
    },
    {
      label: "Lojas com urgência",
      value: String(unidadesComUrgencia),
      description: "unidades que exigem resposta mais rápida",
      tone: "border-red-200 bg-red-50/80 text-red-900",
    },
    {
      label: "Melhor ritmo",
      value: unidadeMaisRapida ? unidadeMaisRapida.supermercado.codigo : "—",
      description: unidadeMaisRapida
        ? `${unidadeMaisRapida.supermercado.nome} · ${formatEstimateMinutes(unidadeMaisRapida.mediaMin!)}`
        : "sem atendimentos finalizados suficientes",
      tone: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
    },
  ];

  return (
    <section className="mb-5 rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(248,250,252,0.94))] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Visão executiva
          </p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
            {isConsolidated ? "Panorama consolidado das unidades" : "Leitura gerencial da unidade selecionada"}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Resumo rápido para identificar pressão operacional, urgências e desempenho médio antes de entrar no detalhe dos cards.
          </p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">
            {unidadeMaisPressionada
              ? `Maior atenção agora: ${unidadeMaisPressionada.supermercado.nome}`
              : "Nenhuma unidade com pressão operacional agora"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {unidadeMaisPressionada
              ? `${unidadeMaisPressionada.aguardando} aguardando · ${unidadeMaisPressionada.urgentes} urgente(s)`
              : "Sem fila relevante no recorte atual"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-[24px] border p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${card.tone}`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">{card.label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight">{card.value}</p>
            <p className="mt-2 text-sm opacity-80">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Unidades que pedem prioridade</p>
              <p className="text-xs text-slate-500">Ordenadas por fila atual, urgência e volume.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Top 3
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {unidadesComResumo.slice(0, 3).map((item, index) => (
              <div
                key={item.supermercado.id}
                className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{item.supermercado.nome}</p>
                    <p className="text-xs text-slate-500">
                      {item.supermercado.codigo} · {item.supermercado.status}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    {item.aguardando} aguardando
                  </span>
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                    {item.urgentes} urgente(s)
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {item.mediaMin !== null ? formatEstimateMinutes(item.mediaMin) : "sem tempo"}
                  </span>
                </div>
              </div>
            ))}

            {unidadesComResumo.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
                Nenhuma unidade disponível neste recorte.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] p-4 text-white shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
          <p className="text-sm font-bold">Leitura estratégica</p>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold text-white">Pressão operacional</p>
              <p className="mt-1">
                {unidadesComFila > 0
                  ? `${unidadesComFila} ${unidadesComFila === 1 ? "unidade está" : "unidades estão"} com fila aberta no momento.`
                  : "Nenhuma unidade está com fila aberta agora."}
              </p>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold text-white">Risco imediato</p>
              <p className="mt-1">
                {unidadesComUrgencia > 0
                  ? `${unidadesComUrgencia} ${unidadesComUrgencia === 1 ? "unidade exige" : "unidades exigem"} atenção para chamados urgentes.`
                  : "Nenhuma urgência ativa neste recorte."}
              </p>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold text-white">Melhor referência</p>
              <p className="mt-1">
                {unidadeMaisRapida
                  ? `${unidadeMaisRapida.supermercado.nome} está com o melhor tempo médio atual.`
                  : "Ainda não há base suficiente para comparar tempo médio."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
