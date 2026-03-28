import { useMemo, useState, useEffect } from "react";
import type { Chamado } from "../types/chamado";

export interface TimeEstimate {
  tempoEstimadoMin: number | null;
  suaVezEmMin: number | null;
  posicaoFila: number | null;
}

export interface TimeEstimatesResult {
  mediaMin: number | null;
  mediaMs: number | null;
  totalFinalizados: number;
  estimates: Record<string, TimeEstimate>;
  tempoRestanteEmAtendimento: Record<string, number | null>;
}

export function useTimeEstimates(allChamados: Chamado[]): TimeEstimatesResult {
  // Tick every 30s to keep estimates fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const now = Date.now();

    // 1) Calculate average service time from completed chamados
    const finalizados = allChamados.filter(
      (c) => c.status === "Finalizado" && c.iniciado_em && c.finalizado_em
    );

    let mediaMs: number | null = null;

    if (finalizados.length > 0) {
      const totalMs = finalizados.reduce((sum, c) => {
        const start = new Date(c.iniciado_em!).getTime();
        const end = new Date(c.finalizado_em!).getTime();
        return sum + Math.max(0, end - start);
      }, 0);
      mediaMs = totalMs / finalizados.length;
    }

    const mediaMin = mediaMs !== null ? Math.max(1, Math.round(mediaMs / 60000)) : null;

    // 2) Build sorted queue of pending chamados (same sort as the app uses)
    const fila = allChamados
      .filter((c) => c.status === "Aguardando")
      .sort((a, b) => {
        if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
        if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
        return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
      });

    // 3) Count active services (operators working right now)
    const emAtendimento = allChamados.filter((c) => c.status === "Em atendimento");
    const numOperadoresAtivos = Math.max(emAtendimento.length, 1);

    // 4) Build estimates map
    const estimates: Record<string, TimeEstimate> = {};
    const tempoRestanteEmAtendimento: Record<string, number | null> = {};

    // For each queued chamado, compute queue position and wait time
    fila.forEach((chamado, index) => {
      if (mediaMs !== null && mediaMin !== null) {
        // How many "batches" of parallel service before this position is reached
        // Position 0 = next to be served (waits ~0 if an operator frees up)
        // Position 1 with 1 operator = waits 1 batch
        // Position 2 with 2 operators = waits 1 batch
        const batchesAhead = Math.floor(index / numOperadoresAtivos);
        const waitMin = batchesAhead * mediaMin;

        estimates[chamado.id] = {
          tempoEstimadoMin: mediaMin,
          suaVezEmMin: waitMin,
          posicaoFila: index + 1,
        };
      } else {
        estimates[chamado.id] = {
          tempoEstimadoMin: null,
          suaVezEmMin: null,
          posicaoFila: index + 1,
        };
      }
    });

    // For chamados currently being served, compute remaining estimated time
    emAtendimento.forEach((chamado) => {
      if (mediaMs !== null && mediaMin !== null && chamado.iniciado_em) {
        const elapsed = now - new Date(chamado.iniciado_em).getTime();
        const remainingMs = Math.max(0, mediaMs - elapsed);
        const remainingMin = Math.max(0, Math.round(remainingMs / 60000));

        estimates[chamado.id] = {
          tempoEstimadoMin: mediaMin,
          suaVezEmMin: null,
          posicaoFila: null,
        };
        tempoRestanteEmAtendimento[chamado.id] = remainingMin;
      } else {
        estimates[chamado.id] = {
          tempoEstimadoMin: mediaMin,
          suaVezEmMin: null,
          posicaoFila: null,
        };
        tempoRestanteEmAtendimento[chamado.id] = null;
      }
    });

    return {
      mediaMin,
      mediaMs,
      totalFinalizados: finalizados.length,
      estimates,
      tempoRestanteEmAtendimento,
    };
  }, [allChamados]);
}

// ── Formatting helpers ───────────────────────────────────────────

export function formatEstimateMinutes(min: number): string {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
