import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Chamado, Setor, TipoServico, Prioridade, Status } from "../types/chamado";
import {
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";

const STORAGE_KEY = "chamados_empilhadeira";
const CHAMADOS_COLLECTION = "chamados";
const LEGACY_SUPERMERCADO_ID = "sem-unidade";

function loadChamados(): Chamado[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Chamado[];
    // Migrate old records that don't have operador_nome or supermercado_id
    return parsed.map((c) => ({
      ...c,
      operador_nome: c.operador_nome ?? null,
      supermercado_id: c.supermercado_id ?? LEGACY_SUPERMERCADO_ID,
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
  supermercado_id: string;
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

interface ChamadoScope {
  supermercadoId: string | null;
  canViewAll: boolean;
}

function canAccessChamado(chamado: Chamado, scope: ChamadoScope): boolean {
  if (scope.canViewAll) return true;
  if (!scope.supermercadoId) return false;
  return chamado.supermercado_id === scope.supermercadoId;
}

function applyScope(chamados: Chamado[], scope: ChamadoScope): Chamado[] {
  if (scope.canViewAll) return chamados;
  if (!scope.supermercadoId) return [];
  return chamados.filter((c) => c.supermercado_id === scope.supermercadoId);
}

export function useChamados(scope: ChamadoScope, callbacks?: ChamadoCallbacks) {
  const [chamados, setChamados] = useState<Chamado[]>(() => loadChamados());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("Todos");
  const [syncError, setSyncError] = useState<string | null>(null);
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    if (!isRemoteSyncEnabled) {
      saveChamados(chamados);
    }
  }, [chamados, isRemoteSyncEnabled]);

  useEffect(() => {
    if (isRemoteSyncEnabled && db) {
      setSyncError(null);
      if (!scope.canViewAll && !scope.supermercadoId) {
        setChamados([]);
        return;
      }

      const chamadosQuery = scope.canViewAll
        ? query(collection(db, CHAMADOS_COLLECTION))
        : query(
            collection(db, CHAMADOS_COLLECTION),
            where("supermercado_id", "==", scope.supermercadoId)
          );

      return onSnapshot(
        chamadosQuery,
        (snapshot) => {
          setSyncError(null);
          const remoteChamados = snapshot.docs.map((snapshotDoc) => {
            const data = snapshotDoc.data() as Partial<Chamado>;
            return {
              id: data.id ?? snapshotDoc.id,
              supermercado_id: data.supermercado_id ?? LEGACY_SUPERMERCADO_ID,
              solicitante_nome: data.solicitante_nome ?? "",
              setor: data.setor as Setor,
              tipo_servico: data.tipo_servico as TipoServico,
              prioridade: data.prioridade as Prioridade,
              status: (data.status as Status) ?? "Aguardando",
              operador_nome: data.operador_nome ?? null,
              criado_em: data.criado_em ?? new Date().toISOString(),
              iniciado_em: data.iniciado_em ?? null,
              finalizado_em: data.finalizado_em ?? null,
            };
          });

          setChamados(sortChamados(remoteChamados));
        },
        (error: FirestoreError) => {
          const code = error.code ? ` (${error.code})` : "";
          setSyncError(
            `Falha ao sincronizar chamados com o Firebase${code}. Verifique login, perfil e regras do Firestore.`
          );
        }
      );
    }

    setSyncError(null);
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
  }, [isRemoteSyncEnabled, scope.canViewAll, scope.supermercadoId]);

  useEffect(() => {
    if (isRemoteSyncEnabled) return;

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
  }, [isRemoteSyncEnabled]);

  const criarChamado = useCallback(
    async (input: NovoChamadoInput) => {
      if (!scope.canViewAll) {
        if (!scope.supermercadoId) return;
        if (input.supermercado_id !== scope.supermercadoId) return;
      }

      const novo: Chamado = {
        id: uuidv4(),
        supermercado_id: input.supermercado_id,
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

      if (db) {
        try {
          await setDoc(doc(collection(db, CHAMADOS_COLLECTION), novo.id), novo);
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível abrir o chamado agora. Tente novamente."
          );
        }
      } else {
        setChamados((prev) => [...prev, novo]);
      }

      callbacks?.onCriado?.(novo);
    },
    [callbacks, scope.canViewAll, scope.supermercadoId]
  );

  const assumirChamado = useCallback(
    async (id: string, operadorNome: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual || !canAccessChamado(chamadoAtual, scope)) return;

      if (db) {
        try {
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            operador_nome: operadorNome,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível assumir o chamado."
          );
        }
        callbacks?.onAssumido?.(
          { ...chamadoAtual, operador_nome: operadorNome },
          operadorNome
        );
        return;
      }

      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id ? { ...c, operador_nome: operadorNome } : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => callbacks?.onAssumido?.(chamado, operadorNome), 0);
        }
        return updated;
      });
    },
    [callbacks, chamados, scope]
  );

  const iniciarAtendimento = useCallback(
    async (id: string, operadorNome: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual || !canAccessChamado(chamadoAtual, scope)) return;

      const iniciado_em = new Date().toISOString();
      const operador_nome = chamadoAtual.operador_nome ?? operadorNome;

      if (db) {
        try {
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Em atendimento" as Status,
            iniciado_em,
            operador_nome,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível iniciar o atendimento."
          );
        }
        callbacks?.onIniciado?.({
          ...chamadoAtual,
          status: "Em atendimento",
          iniciado_em,
          operador_nome,
        });
        return;
      }

      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id
            ? { ...c, status: "Em atendimento" as Status, iniciado_em, operador_nome }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => callbacks?.onIniciado?.(chamado), 0);
        }
        return updated;
      });
    },
    [callbacks, chamados, scope]
  );

  const finalizarChamado = useCallback(
    async (id: string, operadorNome: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual || !canAccessChamado(chamadoAtual, scope)) return;

      const finalizado_em = new Date().toISOString();
      const operador_nome = chamadoAtual.operador_nome ?? operadorNome;

      if (db) {
        try {
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Finalizado" as Status,
            finalizado_em,
            operador_nome,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível finalizar o chamado."
          );
        }
        callbacks?.onFinalizado?.({
          ...chamadoAtual,
          status: "Finalizado",
          finalizado_em,
          operador_nome,
        });
        return;
      }

      setChamados((prev) => {
        const updated = prev.map((c) =>
          c.id === id
            ? { ...c, status: "Finalizado" as Status, finalizado_em, operador_nome }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => callbacks?.onFinalizado?.(chamado), 0);
        }
        return updated;
      });
    },
    [callbacks, chamados, scope]
  );

  const excluirChamado = useCallback(
    async (id: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual || !canAccessChamado(chamadoAtual, scope)) return;

      if (db) {
        await deleteDoc(doc(db, CHAMADOS_COLLECTION, id));
        return;
      }

      setChamados((prev) => prev.filter((c) => c.id !== id));
    },
    [chamados, scope]
  );

  const chamadosEscopo = applyScope(chamados, scope);

  const chamadosFiltrados = sortChamados(
    filterStatus === "Todos"
      ? chamadosEscopo
      : chamadosEscopo.filter((c) => c.status === filterStatus)
  );

  const stats = {
    total: chamadosEscopo.length,
    aguardando: chamadosEscopo.filter((c) => c.status === "Aguardando").length,
    emAtendimento: chamadosEscopo.filter((c) => c.status === "Em atendimento").length,
    finalizado: chamadosEscopo.filter((c) => c.status === "Finalizado").length,
    urgentes: chamadosEscopo.filter((c) => c.prioridade === "Urgente" && c.status !== "Finalizado").length,
  };

  return {
    chamados: chamadosFiltrados,
    allChamados: chamadosEscopo,
    stats,
    syncError,
    isRemoteSyncEnabled,
    filterStatus,
    setFilterStatus,
    criarChamado,
    assumirChamado,
    iniciarAtendimento,
    finalizarChamado,
    excluirChamado,
  };
}
  function mapFirestoreWriteError(error: unknown, fallback: string): Error {
    const firestoreError = error as FirestoreError | undefined;
    if (firestoreError?.code === "permission-denied") {
      return new Error(
        "Permissão negada para salvar chamado. Verifique se seu perfil e unidade estão corretos."
      );
    }
    if (firestoreError?.code === "unauthenticated") {
      return new Error("Sessão expirada. Faça login novamente.");
    }
    if (firestoreError?.code === "unavailable") {
      return new Error("Firebase indisponível no momento. Tente novamente em instantes.");
    }
    return new Error(fallback);
  }
