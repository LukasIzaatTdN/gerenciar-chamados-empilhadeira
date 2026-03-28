import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Chamado, Setor, TipoServico, Prioridade, Status } from "../types/chamado";

const STORAGE_KEY = "chamados_empilhadeira";

function loadChamados(): Chamado[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Chamado[];
    // Migrate old records that don't have operador_nome
    return parsed.map((c) => ({
      ...c,
      operador_nome: c.operador_nome ?? null,
    }));
  } catch {
    return [];
  }
}

function saveChamados(chamados: Chamado[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chamados));
}

function sortChamados(chamados: Chamado[]): Chamado[] {
  return [...chamados].sort((a, b) => {
    // Finalizados go to the bottom
    if (a.status === "Finalizado" && b.status !== "Finalizado") return 1;
    if (a.status !== "Finalizado" && b.status === "Finalizado") return -1;

    // Among finalizados, most recent first
    if (a.status === "Finalizado" && b.status === "Finalizado") {
      return new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime();
    }

    // Urgent first
    if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
    if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;

    // Then oldest first
    return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
  });
}

export interface NovoChamadoInput {
  solicitante_nome: string;
  setor: Setor;
  tipo_servico: TipoServico;
  prioridade: Prioridade;
}

export type FilterStatus = "Todos" | Status;

/** Callback signatures for notification integration */
export interface ChamadoCallbacks {
  onCriado?: (chamado: Chamado) => void;
  onAssumido?: (chamado: Chamado, operadorNome: string) => void;
  onIniciado?: (chamado: Chamado) => void;
  onFinalizado?: (chamado: Chamado) => void;
}

export function useChamados(callbacks?: ChamadoCallbacks) {
  const [chamados, setChamados] = useState<Chamado[]>(() => loadChamados());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("Todos");

  useEffect(() => {
    saveChamados(chamados);
  }, [chamados]);

  // Sync across tabs / panels
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setChamados(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Poll for changes every 2 seconds (for same-tab reactivity via localStorage)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = loadChamados();
      setChamados((prev) => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(current);
        if (prevJson !== newJson) return current;
        return prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const criarChamado = useCallback(
    (input: NovoChamadoInput) => {
      const novo: Chamado = {
        id: uuidv4(),
        solicitante_nome: input.solicitante_nome,
        setor: input.setor,
        tipo_servico: input.tipo_servico,
        prioridade: input.prioridade,
        status: "Aguardando",
        operador_nome: null,
        criado_em: new Date().toISOString(),
        iniciado_em: null,
        finalizado_em: null,
      };
      setChamados((prev) => [...prev, novo]);
      callbacks?.onCriado?.(novo);
    },
    [callbacks]
  );

  const assumirChamado = useCallback(
    (id: string, operadorNome: string) => {
      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id ? { ...c, operador_nome: operadorNome } : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          // Defer callback to avoid setState-in-render
          setTimeout(() => callbacks?.onAssumido?.(chamado, operadorNome), 0);
        }
        return updated;
      });
    },
    [callbacks]
  );

  const iniciarAtendimento = useCallback(
    (id: string) => {
      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id
            ? { ...c, status: "Em atendimento" as Status, iniciado_em: new Date().toISOString() }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => callbacks?.onIniciado?.(chamado), 0);
        }
        return updated;
      });
    },
    [callbacks]
  );

  const finalizarChamado = useCallback(
    (id: string) => {
      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id
            ? { ...c, status: "Finalizado" as Status, finalizado_em: new Date().toISOString() }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => callbacks?.onFinalizado?.(chamado), 0);
        }
        return updated;
      });
    },
    [callbacks]
  );

  const excluirChamado = useCallback((id: string) => {
    setChamados((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const chamadosFiltrados = sortChamados(
    filterStatus === "Todos"
      ? chamados
      : chamados.filter((c) => c.status === filterStatus)
  );

  const stats = {
    total: chamados.length,
    aguardando: chamados.filter((c) => c.status === "Aguardando").length,
    emAtendimento: chamados.filter((c) => c.status === "Em atendimento").length,
    finalizado: chamados.filter((c) => c.status === "Finalizado").length,
    urgentes: chamados.filter((c) => c.prioridade === "Urgente" && c.status !== "Finalizado").length,
  };

  return {
    chamados: chamadosFiltrados,
    allChamados: chamados,
    stats,
    filterStatus,
    setFilterStatus,
    criarChamado,
    assumirChamado,
    iniciarAtendimento,
    finalizarChamado,
    excluirChamado,
  };
}
