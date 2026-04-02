import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Chamado, Setor, TipoServico, Prioridade, Status } from "../types/chamado";
import {
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const STORAGE_KEY = "chamados_empilhadeira";
const CHAMADOS_COLLECTION = "chamados";
const LEGACY_SUPERMERCADO_ID = "sem-unidade";
const TIPOS_SERVICO_VALIDOS: TipoServico[] = [
  "Descarga",
  "Reposição",
  "Retirada",
  "Movimentação",
];
const PRIORIDADES_VALIDAS: Prioridade[] = ["Normal", "Urgente"];
const STATUS_VALIDOS: Status[] = ["Aguardando", "Em atendimento", "Finalizado"];

function sanitizeDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

function normalizeChamado(data: Partial<Chamado>, fallbackId: string): Chamado {
  const tipoServico = TIPOS_SERVICO_VALIDOS.includes(data.tipo_servico as TipoServico)
    ? (data.tipo_servico as TipoServico)
    : "Descarga";
  const prioridade = PRIORIDADES_VALIDAS.includes(data.prioridade as Prioridade)
    ? (data.prioridade as Prioridade)
    : "Normal";
  const status = STATUS_VALIDOS.includes(data.status as Status)
    ? (data.status as Status)
    : "Aguardando";

  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : fallbackId,
    supermercado_id:
      typeof data.supermercado_id === "string" && data.supermercado_id.trim()
        ? data.supermercado_id
        : LEGACY_SUPERMERCADO_ID,
    solicitante_nome:
      typeof data.solicitante_nome === "string" && data.solicitante_nome.trim()
        ? data.solicitante_nome
        : "Solicitante",
    setor: typeof data.setor === "string" && data.setor.trim() ? data.setor : "Setor não informado",
    tipo_servico: tipoServico,
    prioridade,
    status,
    operador_nome:
      typeof data.operador_nome === "string" && data.operador_nome.trim()
        ? data.operador_nome
        : null,
    criado_em: sanitizeDateString(data.criado_em) ?? new Date().toISOString(),
    assumido_em: sanitizeDateString((data as Partial<Chamado>).assumido_em),
    a_caminho_em: sanitizeDateString((data as Partial<Chamado>).a_caminho_em),
    cheguei_em: sanitizeDateString((data as Partial<Chamado>).cheguei_em),
    iniciado_em: sanitizeDateString(data.iniciado_em),
    finalizado_em: sanitizeDateString(data.finalizado_em),
    cancelado_em: sanitizeDateString((data as Partial<Chamado>).cancelado_em),
  };
}

function loadChamados(): Chamado[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Partial<Chamado>[];
    return parsed.map((c, index) => normalizeChamado(c, `local-${index}`));
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

async function ensureFirebaseSessionForChamado(chamado: Chamado) {
  if (!db) return;

  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  await currentUser.getIdToken(true);

  const userSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
  if (!userSnap.exists()) {
    throw new Error("Cadastro do usuário não encontrado no Firebase.");
  }

  const userData = userSnap.data() as {
    perfil?: string;
    supermercado_id?: string | null;
    status?: string;
  };

  if (userData.status === "Inativo") {
    throw new Error("Seu acesso está inativo no sistema.");
  }

  if (
    userData.perfil !== "Administrador Geral" &&
    userData.supermercado_id !== chamado.supermercado_id
  ) {
    throw new Error(
      `Unidade divergente no Firebase. Usuário: ${userData.supermercado_id ?? "sem unidade"} · Chamado: ${chamado.supermercado_id}`
    );
  }
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
          const remoteChamados = snapshot.docs.map((snapshotDoc) =>
            normalizeChamado(snapshotDoc.data() as Partial<Chamado>, snapshotDoc.id)
          );

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
          const parsed = JSON.parse(e.newValue) as Partial<Chamado>[];
          setChamados(parsed.map((item, index) => normalizeChamado(item, `local-${index}`)));
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
        assumido_em: null,
        a_caminho_em: null,
        cheguei_em: null,
        iniciado_em: null,
        finalizado_em: null,
        cancelado_em: null,
      };

      if (db) {
        try {
          await setDoc(doc(collection(db, CHAMADOS_COLLECTION), novo.id), novo);
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao abrir chamado. Verifique perfil e unidade."
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
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }

      if (db) {
        try {
          await ensureFirebaseSessionForChamado(chamadoAtual);
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Aguardando" as Status,
            operador_nome: operadorNome,
            assumido_em: chamadoAtual.assumido_em ?? new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao assumir chamado. Verifique login e unidade."
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
          c.id === id
            ? {
                ...c,
                operador_nome: operadorNome,
                assumido_em: c.assumido_em ?? new Date().toISOString(),
              }
            : c
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
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }

      const iniciado_em = new Date().toISOString();
      const operador_nome = operadorNome;

      if (db) {
        try {
          await ensureFirebaseSessionForChamado(chamadoAtual);
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Em atendimento" as Status,
            iniciado_em,
            operador_nome,
            assumido_em: chamadoAtual.assumido_em ?? iniciado_em,
            a_caminho_em: chamadoAtual.a_caminho_em ?? iniciado_em,
            cheguei_em: chamadoAtual.cheguei_em ?? iniciado_em,
            finalizado_em: null,
            cancelado_em: null,
            atualizado_em: new Date().toISOString(),
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao iniciar atendimento. Verifique login e unidade."
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
            ? {
                ...c,
                status: "Em atendimento" as Status,
                iniciado_em,
                operador_nome,
                assumido_em: c.assumido_em ?? iniciado_em,
                a_caminho_em: c.a_caminho_em ?? iniciado_em,
                cheguei_em: c.cheguei_em ?? iniciado_em,
                cancelado_em: null,
              }
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
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }

      const finalizado_em = new Date().toISOString();
      const operador_nome = operadorNome;

      if (db) {
        try {
          await ensureFirebaseSessionForChamado(chamadoAtual);
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Finalizado" as Status,
            finalizado_em,
            operador_nome,
            cancelado_em: null,
            atualizado_em: new Date().toISOString(),
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao finalizar chamado. Verifique login e unidade."
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
            ? {
                ...c,
                status: "Finalizado" as Status,
                finalizado_em,
                operador_nome,
                cancelado_em: null,
              }
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

  const marcarACaminho = useCallback(
    async (id: string, operadorNome: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }
      if (db) {
        try {
          await ensureFirebaseSessionForChamado(chamadoAtual);
          const agora = new Date().toISOString();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Aguardando" as Status,
            operador_nome: operadorNome,
            assumido_em: chamadoAtual.assumido_em ?? agora,
            a_caminho_em: chamadoAtual.a_caminho_em ?? agora,
            atualizado_em: agora,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao marcar deslocamento. Verifique login e unidade."
          );
        }
        return;
      }

      setChamados((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                operador_nome: operadorNome,
                assumido_em: c.assumido_em ?? new Date().toISOString(),
                a_caminho_em: c.a_caminho_em ?? new Date().toISOString(),
              }
            : c
        )
      );
    },
    [chamados, scope]
  );

  const marcarChegada = useCallback(
    async (id: string, operadorNome: string) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }
      if (db) {
        try {
          await ensureFirebaseSessionForChamado(chamadoAtual);
          const agora = new Date().toISOString();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Aguardando" as Status,
            operador_nome: operadorNome,
            assumido_em: chamadoAtual.assumido_em ?? agora,
            a_caminho_em: chamadoAtual.a_caminho_em ?? agora,
            cheguei_em: chamadoAtual.cheguei_em ?? agora,
            atualizado_em: agora,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao registrar chegada. Verifique login e unidade."
          );
        }
        return;
      }

      setChamados((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                operador_nome: operadorNome,
                assumido_em: c.assumido_em ?? new Date().toISOString(),
                a_caminho_em: c.a_caminho_em ?? new Date().toISOString(),
                cheguei_em: c.cheguei_em ?? new Date().toISOString(),
              }
            : c
        )
      );
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
    marcarACaminho,
    marcarChegada,
    iniciarAtendimento,
    finalizarChamado,
    excluirChamado,
  };
}
  function mapFirestoreWriteError(error: unknown, fallback: string): Error {
    const firestoreError = error as FirestoreError | undefined;
    if (firestoreError?.code === "permission-denied") {
      return new Error(`${fallback} (permission-denied)`);
    }
    if (firestoreError?.code === "unauthenticated") {
      return new Error(`${fallback} (sessão expirada)`);
    }
    if (firestoreError?.code === "unavailable") {
      return new Error(`${fallback} (Firebase indisponível)`);
    }
    return new Error(fallback);
  }
