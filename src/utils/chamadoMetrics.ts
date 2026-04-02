import type { Chamado } from "../types/chamado";

function diffMinutes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.max(1, Math.round(diff / 60000));
}

export function formatMinutesLabel(min: number | null) {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function getChamadoTimeMetrics(chamado: Chamado) {
  const encerradoEm = chamado.cancelado_em ?? chamado.finalizado_em;

  return {
    tempoParaAssumir: diffMinutes(chamado.criado_em, chamado.assumido_em),
    tempoAteACaminho: diffMinutes(chamado.assumido_em, chamado.a_caminho_em),
    tempoAteChegar: diffMinutes(chamado.a_caminho_em, chamado.cheguei_em),
    tempoAtendimento: diffMinutes(chamado.iniciado_em, chamado.finalizado_em),
    tempoTotalChamado: diffMinutes(chamado.criado_em, encerradoEm),
  };
}

export function getAverageChamadoMetrics(chamados: Chamado[]) {
  const totals = {
    tempoParaAssumir: [] as number[],
    tempoAteACaminho: [] as number[],
    tempoAteChegar: [] as number[],
    tempoAtendimento: [] as number[],
    tempoTotalChamado: [] as number[],
  };

  chamados.forEach((chamado) => {
    const metrics = getChamadoTimeMetrics(chamado);
    (Object.keys(totals) as (keyof typeof totals)[]).forEach((key) => {
      const value = metrics[key];
      if (value !== null) totals[key].push(value);
    });
  });

  return {
    tempoParaAssumir: averageOrNull(totals.tempoParaAssumir),
    tempoAteACaminho: averageOrNull(totals.tempoAteACaminho),
    tempoAteChegar: averageOrNull(totals.tempoAteChegar),
    tempoAtendimento: averageOrNull(totals.tempoAtendimento),
    tempoTotalChamado: averageOrNull(totals.tempoTotalChamado),
  };
}

function averageOrNull(values: number[]) {
  if (values.length === 0) return null;
  return Math.max(1, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
}
