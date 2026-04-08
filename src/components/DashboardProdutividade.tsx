import { useMemo, useState } from "react";
import type { Chamado, TipoServico } from "../types/chamado";
import { TIPOS_SERVICO } from "../types/chamado";
import { getCategoriaChamado } from "../utils/chamadoStatus";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import { cn } from "../utils/cn";

interface DashboardProdutividadeProps {
  chamados: Chamado[];
}

type ChartDatum = {
  label: string;
  value: number;
};

type PeriodoFiltro = "Hoje" | "7 dias" | "30 dias";

function sameDay(iso: string, reference: Date) {
  const date = new Date(iso);
  return (
    date.getDate() === reference.getDate() &&
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

function isWithinDays(iso: string, reference: Date, days: number) {
  const date = new Date(iso);
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start && date <= reference;
}

function getDurationMinutes(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function getTopSetor(chamados: Chamado[]) {
  if (chamados.length === 0) return { setor: "Sem dados", total: 0 };

  const counts = new Map<string, number>();
  chamados.forEach((chamado) => {
    counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
  });

  const [setor, total] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { setor, total };
}

function buildHourlySeries(chamados: Chamado[]) {
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const hour = index * 3;
    return { label: `${String(hour).padStart(2, "0")}h`, value: 0 };
  });

  chamados.forEach((chamado) => {
    const source = chamado.finalizado_em ?? chamado.iniciado_em ?? chamado.criado_em;
    const hour = new Date(source).getHours();
    const bucketIndex = Math.min(Math.floor(hour / 3), buckets.length - 1);
    buckets[bucketIndex].value += 1;
  });

  return buckets;
}

function buildSectorData(chamados: Chamado[]): ChartDatum[] {
  const counts = new Map<string, number>();
  chamados.forEach((chamado) => {
    counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildServiceData(chamados: Chamado[]): ChartDatum[] {
  return TIPOS_SERVICO.map((tipo) => ({
    label: tipo,
    value: chamados.filter((chamado) => chamado.tipo_servico === tipo).length,
  }));
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function BarChart({
  title,
  subtitle,
  data,
  tone = "blue",
}: {
  title: string;
  subtitle: string;
  data: ChartDatum[];
  tone?: "blue" | "amber";
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const barColor = tone === "amber" ? "from-amber-400 to-orange-500" : "from-[#0f3d75] to-blue-500";

  return (
    <CardShell title={title} subtitle={subtitle}>
      <div className="space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-slate-400">Sem dados para exibir.</p>
        ) : (
          data.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-slate-700">{item.label}</span>
                <span className="font-semibold text-slate-500">{item.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${barColor}`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </CardShell>
  );
}

function LineChart({ data }: { data: ChartDatum[] }) {
  const width = 100;
  const height = 44;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data
    .map((item, index) => {
      const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
      const y = height - (item.value / max) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <CardShell
      title="Atendimentos ao longo do dia"
      subtitle="Distribuição das movimentações em blocos de 3 horas."
    >
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full overflow-visible">
          {[0, 1, 2, 3].map((line) => {
            const y = 6 + (line * (height - 10)) / 3;
            return <line key={line} x1="0" y1={y} x2={width} y2={y} stroke="#cbd5e1" strokeDasharray="2 2" />;
          })}
          <polyline
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
          {data.map((item, index) => {
            const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
            const y = height - (item.value / max) * (height - 6) - 3;
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="2.5" fill="#0f3d75" />
                <text x={x} y={height + 4} textAnchor="middle" fontSize="4" fill="#64748b">
                  {item.label}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="lineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#0f3d75" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </CardShell>
  );
}

function DonutChart({ data }: { data: ChartDatum[] }) {
  const total = Math.max(data.reduce((sum, item) => sum + item.value, 0), 1);
  const colors = ["#10b981", "#0f3d75", "#f59e0b", "#ef4444"];
  let currentAngle = -90;

  const segments = data.map((item, index) => {
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    const endAngle = currentAngle;

    const start = polarToCartesian(50, 50, 36, endAngle);
    const end = polarToCartesian(50, 50, 36, startAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = ["M", start.x, start.y, "A", 36, 36, 0, largeArcFlag, 0, end.x, end.y].join(" ");

    return { ...item, color: colors[index % colors.length], path };
  });

  return (
    <CardShell title="Tipos de serviço" subtitle="Participação de cada tipo de chamado no período.">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full bg-slate-50">
          <svg viewBox="0 0 100 100" className="h-40 w-40">
            <circle cx="50" cy="50" r="36" fill="none" stroke="#e2e8f0" strokeWidth="12" />
            {segments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                fill="none"
                stroke={segment.color}
                strokeWidth="12"
                strokeLinecap="round"
              />
            ))}
            <text x="50" y="48" textAnchor="middle" fontSize="8" fill="#0f172a" fontWeight="700">
              {data.reduce((sum, item) => sum + item.value, 0)}
            </text>
            <text x="50" y="57" textAnchor="middle" fontSize="4" fill="#64748b">
              chamados
            </text>
          </svg>
        </div>
        <div className="space-y-3 lg:flex-1">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="text-sm font-medium text-slate-700">{segment.label}</span>
              </div>
              <span className="text-sm font-semibold text-slate-500">{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export default function DashboardProdutividade({ chamados }: DashboardProdutividadeProps) {
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("Hoje");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<"Todos" | "operacional" | "televendas">("Todos");
  const [tipoSelecionado, setTipoSelecionado] = useState<"Todos" | TipoServico>("Todos");

  const {
    chamadosFiltrados,
    urgentesFiltrados,
    setorMaisAcionado,
    setorData,
    lineData,
    serviceData,
    setoresMaisSolicitados,
    ultimosAtendimentos,
    mediaMinPeriodo,
  } = useMemo(() => {
    const now = new Date();
    const inPeriod = (iso: string) =>
      periodo === "Hoje"
        ? sameDay(iso, now)
        : periodo === "7 dias"
        ? isWithinDays(iso, now, 7)
        : isWithinDays(iso, now, 30);

    const chamadosFiltradosPorPeriodo = chamados.filter((chamado) => inPeriod(chamado.criado_em));
    const chamadosFiltradosPorCategoria =
      categoriaSelecionada === "Todos"
        ? chamadosFiltradosPorPeriodo
        : chamadosFiltradosPorPeriodo.filter(
            (chamado) => getCategoriaChamado(chamado) === categoriaSelecionada
          );
    const chamadosFiltrados =
      tipoSelecionado === "Todos"
        ? chamadosFiltradosPorCategoria
        : chamadosFiltradosPorCategoria.filter((chamado) => chamado.tipo_servico === tipoSelecionado);
    const urgentesFiltrados = chamadosFiltrados.filter((chamado) => chamado.prioridade === "Urgente");
    const setorMaisAcionado = getTopSetor(chamadosFiltrados);
    const setorData = buildSectorData(chamadosFiltrados);
    const lineData = buildHourlySeries(chamadosFiltrados);
    const serviceData = buildServiceData(chamadosFiltrados);
    const setoresMaisSolicitados = [...setorData].slice(0, 5);
    const ultimosAtendimentos = chamadosFiltrados
      .filter(
        (chamado) =>
          chamado.status === "Finalizado" &&
          chamado.finalizado_em &&
          chamado.iniciado_em &&
          inPeriod(chamado.finalizado_em)
      )
      .sort((a, b) => new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime())
      .slice(0, 5);

    const finalizadosNoPeriodo = chamadosFiltrados.filter(
      (chamado) =>
        chamado.status === "Finalizado" &&
        chamado.iniciado_em &&
        chamado.finalizado_em &&
        inPeriod(chamado.finalizado_em)
    );

    const mediaMinPeriodo =
      finalizadosNoPeriodo.length > 0
        ? Math.max(
            1,
            Math.round(
              finalizadosNoPeriodo.reduce(
                (sum, chamado) =>
                  sum +
                  (new Date(chamado.finalizado_em!).getTime() - new Date(chamado.iniciado_em!).getTime()),
                0
              ) /
                finalizadosNoPeriodo.length /
                60000
            )
          )
        : null;

    return {
      chamadosFiltrados,
      urgentesFiltrados,
      setorMaisAcionado,
      setorData,
      lineData,
      serviceData,
      setoresMaisSolicitados,
      ultimosAtendimentos,
      mediaMinPeriodo,
    };
  }, [chamados, periodo, categoriaSelecionada, tipoSelecionado]);

  const cards = [
    {
      label: "Chamados no período",
      value: String(chamadosFiltrados.length),
      tone: "border-blue-200 bg-[linear-gradient(145deg,rgba(239,246,255,0.98),rgba(255,255,255,0.98))]",
    },
    {
      label: "Tempo médio",
      value: mediaMinPeriodo !== null ? formatEstimateMinutes(mediaMinPeriodo) : "—",
      tone: "border-emerald-200 bg-[linear-gradient(145deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))]",
    },
    {
      label: "Setor mais acionado",
      value: setorMaisAcionado.total > 0 ? setorMaisAcionado.setor : "Sem dados",
      tone: "border-slate-200 bg-[linear-gradient(145deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))]",
      secondary: setorMaisAcionado.total > 0 ? `${setorMaisAcionado.total} chamados` : "nenhuma solicitação",
    },
    {
      label: "Urgentes",
      value: String(urgentesFiltrados.length),
      tone: "border-red-200 bg-[linear-gradient(145deg,rgba(254,242,242,0.98),rgba(255,255,255,0.98))]",
    },
  ];

  return (
    <section className="space-y-6">
      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] p-5 shadow-[0_22px_40px_rgba(15,23,42,0.12)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Dashboard de produtividade</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              Indicadores da operação logística
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Acompanhe desempenho, setores com maior demanda e a distribuição dos atendimentos ao longo do dia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["Hoje", "7 dias", "30 dias"] as PeriodoFiltro[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriodo(item)}
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                  periodo === item
                    ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-[0_14px_28px_rgba(15,23,42,0.2)]"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoriaSelecionada("Todos")}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              categoriaSelecionada === "Todos"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Todas categorias
          </button>
          <button
            type="button"
            onClick={() => setCategoriaSelecionada("operacional")}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              categoriaSelecionada === "operacional"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Operacionais
          </button>
          <button
            type="button"
            onClick={() => setCategoriaSelecionada("televendas")}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              categoriaSelecionada === "televendas"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Televendas
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTipoSelecionado("Todos")}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
              tipoSelecionado === "Todos"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Todos os tipos
          </button>
          {TIPOS_SERVICO.map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setTipoSelecionado(tipo)}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
                tipoSelecionado === tipo
                  ? tipo === "Atendimento Televendas"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "rounded-[28px] border p-5 shadow-[0_18px_34px_rgba(15,23,42,0.08)]",
              card.tone
            )}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{card.value}</p>
            {card.secondary && <p className="mt-2 text-sm text-slate-500">{card.secondary}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <BarChart
          title="Chamados por setor"
          subtitle="Top setores com mais solicitações no período."
          data={setorData}
        />
        <LineChart data={lineData} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <DonutChart data={serviceData} />

        <CardShell
          title="Setores que mais solicitaram"
          subtitle="Ranking rápido dos pontos com maior volume de chamados."
        >
          <div className="space-y-3">
            {setoresMaisSolicitados.length === 0 ? (
              <p className="text-sm text-slate-400">Sem solicitações registradas.</p>
            ) : (
              setoresMaisSolicitados.map((item, index) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-xs font-bold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-500">{item.value} chamados</span>
                </div>
              ))
            )}
          </div>
        </CardShell>
      </div>

      <CardShell
        title="Últimos atendimentos realizados"
        subtitle="Histórico recente dos atendimentos concluídos pela equipe."
      >
        <div className="space-y-3">
          {ultimosAtendimentos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum atendimento finalizado ainda.</p>
          ) : (
            ultimosAtendimentos.map((chamado) => (
              <div
                key={chamado.id}
                className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{chamado.tipo_servico}</p>
                  <p className="mt-1 text-sm text-slate-500">{chamado.setor}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Solicitante</p>
                  <p className="mt-1 text-sm text-slate-700">{chamado.solicitante_nome}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Tempo</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {getDurationMinutes(chamado.iniciado_em!, chamado.finalizado_em!)} min
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Concluído</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDateTime(chamado.finalizado_em!)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardShell>
    </section>
  );
}
