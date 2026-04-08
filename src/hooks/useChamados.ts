import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  CategoriaChamado,
  Chamado,
  ItemTelevendas,
  Setor,
  TipoServico,
  Prioridade,
  Status,
} from "../types/chamado";
import { isTelevendasChamado } from "../utils/chamadoStatus";
import {
  getTotaisItensTelevendas,
  hasItemFaltante,
  itensToLegacyProduto,
  itensToLegacyQuantidade,
  normalizeItensTelevendas,
  parseProdutoQuantidadeTextToItens,
} from "../utils/televendasItems";
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
import { auth, db } from "../config/firebase";

const STORAGE_KEY = "chamados_empilhadeira";
const CHAMADOS_COLLECTION = "chamados";
const LEGACY_SUPERMERCADO_ID = "sem-unidade";
const TIPOS_SERVICO_VALIDOS: TipoServico[] = [
  "Descarga",
  "Reposição",
  "Retirada",
  "Movimentação",
  "Apoio interno",
  "Atendimento Televendas",
];
const PRIORIDADES_VALIDAS: Prioridade[] = ["Normal", "Urgente"];
const STATUS_VALIDOS: Status[] = ["Aguardando", "Em atendimento", "Finalizado"];
const STATUS_VALIDOS_TELEVENDAS: Status[] = [
  "Aberto",
  "Em separação",
  "Incompleto",
  "Pronto",
  "Finalizado",
  "Cancelado",
];

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
  const statusRaw = data.status as Status;
  const status =
    STATUS_VALIDOS.includes(statusRaw) || STATUS_VALIDOS_TELEVENDAS.includes(statusRaw)
      ? statusRaw
      : data.tipo_servico === "Atendimento Televendas"
      ? "Aberto"
      : "Aguardando";

  const categoria: CategoriaChamado =
    data.categoria === "televendas" || data.tipo_servico === "Atendimento Televendas"
      ? "televendas"
      : "operacional";

  const itensTelevendas = normalizeItensTelevendas(
    Array.isArray((data as Partial<Chamado>).itens)
      ? ((data as Partial<Chamado>).itens as ItemTelevendas[])
      : categoria === "televendas"
      ? parseProdutoQuantidadeTextToItens(
          (data as Partial<Chamado>).produto ?? null,
          (data as Partial<Chamado>).quantidade ?? null
        )
      : []
  );
  const totaisTelevendas = getTotaisItensTelevendas(itensTelevendas);
  const totalSolicitadoRaw = (data as Partial<Chamado>).total_solicitado;
  const totalEncontradoRaw = (data as Partial<Chamado>).total_encontrado;
  const percentualAtendidoRaw = (data as Partial<Chamado>).percentual_atendido;

  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : fallbackId,
    categoria,
    supermercado_id:
      typeof data.supermercado_id === "string" && data.supermercado_id.trim()
        ? data.supermercado_id
        : LEGACY_SUPERMERCADO_ID,
    solicitante_nome:
      typeof data.solicitante_nome === "string" && data.solicitante_nome.trim()
        ? data.solicitante_nome
        : "Solicitante",
    setor: typeof data.setor === "string" && data.setor.trim() ? data.setor : "Setor não informado",
    local_exato:
      typeof (data as Partial<Chamado>).local_exato === "string" &&
      (data as Partial<Chamado>).local_exato!.trim()
        ? (data as Partial<Chamado>).local_exato!.trim()
        : null,
    tipo_servico: tipoServico,
    numero_pedido:
      typeof (data as Partial<Chamado>).numero_pedido === "string" &&
      (data as Partial<Chamado>).numero_pedido!.trim()
        ? (data as Partial<Chamado>).numero_pedido!.trim()
        : null,
    cliente:
      typeof (data as Partial<Chamado>).cliente === "string" &&
      (data as Partial<Chamado>).cliente!.trim()
        ? (data as Partial<Chamado>).cliente!.trim()
        : null,
    produto:
      typeof (data as Partial<Chamado>).produto === "string" &&
      (data as Partial<Chamado>).produto!.trim()
        ? (data as Partial<Chamado>).produto!.trim()
        : null,
    quantidade:
      typeof (data as Partial<Chamado>).quantidade === "string" &&
      (data as Partial<Chamado>).quantidade!.trim()
        ? (data as Partial<Chamado>).quantidade!.trim()
        : null,
    itens: itensTelevendas,
    total_solicitado:
      typeof totalSolicitadoRaw === "number"
        ? totalSolicitadoRaw
        : categoria === "televendas"
        ? totaisTelevendas.totalSolicitado
        : null,
    total_encontrado:
      typeof totalEncontradoRaw === "number"
        ? totalEncontradoRaw
        : categoria === "televendas"
        ? totaisTelevendas.totalEncontrado
        : null,
    percentual_atendido:
      typeof percentualAtendidoRaw === "number"
        ? percentualAtendidoRaw
        : categoria === "televendas"
        ? totaisTelevendas.percentualAtendido
        : null,
    motivo_incompleto:
      typeof (data as Partial<Chamado>).motivo_incompleto === "string" &&
      (data as Partial<Chamado>).motivo_incompleto!.trim()
        ? (data as Partial<Chamado>).motivo_incompleto!.trim()
        : null,
    observacao_operador:
      typeof (data as Partial<Chamado>).observacao_operador === "string" &&
      (data as Partial<Chamado>).observacao_operador!.trim()
        ? (data as Partial<Chamado>).observacao_operador!.trim()
        : null,
    atualizado_em: sanitizeDateString((data as Partial<Chamado>).atualizado_em),
    atualizado_por:
      typeof (data as Partial<Chamado>).atualizado_por === "string" &&
      (data as Partial<Chamado>).atualizado_por!.trim()
        ? (data as Partial<Chamado>).atualizado_por!.trim()
        : null,
    local_separacao:
      typeof (data as Partial<Chamado>).local_separacao === "string" &&
      (data as Partial<Chamado>).local_separacao!.trim()
        ? (data as Partial<Chamado>).local_separacao!.trim()
        : null,
    prazo_limite:
      typeof (data as Partial<Chamado>).prazo_limite === "string" &&
      (data as Partial<Chamado>).prazo_limite!.trim()
        ? (data as Partial<Chamado>).prazo_limite!.trim()
        : null,
    prioridade,
    observacoes:
      typeof (data as Partial<Chamado>).observacoes === "string" &&
      (data as Partial<Chamado>).observacoes!.trim()
        ? (data as Partial<Chamado>).observacoes!.trim()
        : null,
    foto_nome:
      typeof (data as Partial<Chamado>).foto_nome === "string" &&
      (data as Partial<Chamado>).foto_nome!.trim()
        ? (data as Partial<Chamado>).foto_nome!.trim()
        : null,
    foto_data_url:
      typeof (data as Partial<Chamado>).foto_data_url === "string" &&
      (data as Partial<Chamado>).foto_data_url!.trim()
        ? (data as Partial<Chamado>).foto_data_url!.trim()
        : null,
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
  categoria: CategoriaChamado;
  solicitante_nome: string;
  setor: Setor;
  local_exato?: string | null;
  tipo_servico: TipoServico;
  numero_pedido?: string | null;
  cliente?: string | null;
  produto?: string | null;
  quantidade?: string | null;
  itens?: ItemTelevendas[];
  local_separacao?: string | null;
  prazo_limite?: string | null;
  prioridade: Prioridade;
  observacoes?: string | null;
  foto_nome?: string | null;
  foto_data_url?: string | null;
}

export type FilterStatus = "Todos" | Status;

/** Callback signatures for notification integration */
export interface ChamadoCallbacks {
  onCriado?: (chamado: Chamado) => void;
  onAssumido?: (chamado: Chamado, operadorNome: string) => void;
  onIniciado?: (chamado: Chamado) => void;
  onFinalizado?: (chamado: Chamado) => void;
}

interface AtualizacaoItensTelevendasInput {
  itens: ItemTelevendas[];
  operadorNome: string;
  status: "Pronto" | "Incompleto" | "Cancelado";
  motivoIncompleto?: string | null;
  observacaoOperador?: string | null;
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

async function ensureFirebaseSessionForChamado() {
  if (!db) return;

  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error("Sessão expirada. Faça login novamente.");
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

      const itensTelevendas =
        input.categoria === "televendas" ? normalizeItensTelevendas(input.itens ?? []) : [];
      const totaisTelevendas = getTotaisItensTelevendas(itensTelevendas);

      const novo: Chamado = {
        id: uuidv4(),
        categoria:
          input.categoria === "televendas" || input.tipo_servico === "Atendimento Televendas"
            ? "televendas"
            : "operacional",
        supermercado_id: input.supermercado_id,
        solicitante_nome: input.solicitante_nome,
        setor: input.setor,
        local_exato:
          typeof input.local_exato === "string" && input.local_exato.trim()
            ? input.local_exato.trim()
            : null,
        tipo_servico:
          input.categoria === "televendas" ? "Atendimento Televendas" : input.tipo_servico,
        numero_pedido:
          typeof input.numero_pedido === "string" && input.numero_pedido.trim()
            ? input.numero_pedido.trim()
            : null,
        cliente:
          typeof input.cliente === "string" && input.cliente.trim() ? input.cliente.trim() : null,
        produto:
          input.categoria === "televendas"
            ? itensToLegacyProduto(itensTelevendas)
            : typeof input.produto === "string" && input.produto.trim()
            ? input.produto.trim()
            : null,
        quantidade:
          input.categoria === "televendas"
            ? itensToLegacyQuantidade(itensTelevendas)
            : typeof input.quantidade === "string" && input.quantidade.trim()
            ? input.quantidade.trim()
            : null,
        itens: itensTelevendas,
        total_solicitado: input.categoria === "televendas" ? totaisTelevendas.totalSolicitado : null,
        total_encontrado: input.categoria === "televendas" ? totaisTelevendas.totalEncontrado : null,
        percentual_atendido: input.categoria === "televendas" ? totaisTelevendas.percentualAtendido : null,
        motivo_incompleto: null,
        observacao_operador: null,
        atualizado_em: null,
        atualizado_por: null,
        local_separacao:
          typeof input.local_separacao === "string" && input.local_separacao.trim()
            ? input.local_separacao.trim()
            : null,
        prazo_limite:
          typeof input.prazo_limite === "string" && input.prazo_limite.trim()
            ? input.prazo_limite.trim()
            : null,
        prioridade: input.prioridade,
        observacoes:
          typeof input.observacoes === "string" && input.observacoes.trim()
            ? input.observacoes.trim()
            : null,
        foto_nome:
          typeof input.foto_nome === "string" && input.foto_nome.trim()
            ? input.foto_nome.trim()
            : null,
        foto_data_url:
          typeof input.foto_data_url === "string" && input.foto_data_url.trim()
            ? input.foto_data_url.trim()
            : null,
        status: input.categoria === "televendas" ? "Aberto" : "Aguardando",
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
          await ensureFirebaseSessionForChamado();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: isTelevendasChamado(chamadoAtual) ? ("Em separação" as Status) : ("Aguardando" as Status),
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
                status: isTelevendasChamado(c) ? ("Em separação" as Status) : c.status,
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
          await ensureFirebaseSessionForChamado();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: isTelevendasChamado(chamadoAtual) ? ("Pronto" as Status) : ("Em atendimento" as Status),
            iniciado_em,
            operador_nome,
            assumido_em: chamadoAtual.assumido_em ?? iniciado_em,
            a_caminho_em: chamadoAtual.a_caminho_em ?? iniciado_em,
            cheguei_em: chamadoAtual.cheguei_em ?? iniciado_em,
            finalizado_em: null,
            cancelado_em: null,
            atualizado_em: iniciado_em,
            atualizado_por: operador_nome,
          });
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao iniciar atendimento. Verifique login e unidade."
          );
        }
        callbacks?.onIniciado?.({
          ...chamadoAtual,
          status: isTelevendasChamado(chamadoAtual) ? "Pronto" : "Em atendimento",
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
                status: isTelevendasChamado(c) ? ("Pronto" as Status) : ("Em atendimento" as Status),
                iniciado_em,
                operador_nome,
                assumido_em: c.assumido_em ?? iniciado_em,
                a_caminho_em: c.a_caminho_em ?? iniciado_em,
                cheguei_em: c.cheguei_em ?? iniciado_em,
                cancelado_em: null,
                atualizado_em: iniciado_em,
                atualizado_por: operador_nome,
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
          await ensureFirebaseSessionForChamado();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Finalizado" as Status,
            finalizado_em,
            operador_nome,
            cancelado_em: null,
            atualizado_em: finalizado_em,
            atualizado_por: operador_nome,
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
                atualizado_em: finalizado_em,
                atualizado_por: operador_nome,
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
          await ensureFirebaseSessionForChamado();
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
          await ensureFirebaseSessionForChamado();
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

  const atualizarItensTelevendas = useCallback(
    async (id: string, input: AtualizacaoItensTelevendasInput) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }
      if (!isTelevendasChamado(chamadoAtual)) {
        throw new Error("Esta ação é exclusiva para pedidos de televendas.");
      }

      const itensNormalizados = normalizeItensTelevendas(input.itens);
      const totais = getTotaisItensTelevendas(itensNormalizados);
      const statusFinal: Status =
        input.status === "Incompleto" && !hasItemFaltante(itensNormalizados)
          ? "Pronto"
          : input.status;
      const atualizadoEm = new Date().toISOString();

      const payload = {
        itens: itensNormalizados,
        produto: itensToLegacyProduto(itensNormalizados),
        quantidade: itensToLegacyQuantidade(itensNormalizados),
        total_solicitado: totais.totalSolicitado,
        total_encontrado: totais.totalEncontrado,
        percentual_atendido: totais.percentualAtendido,
        status: statusFinal,
        motivo_incompleto:
          statusFinal === "Incompleto" && input.motivoIncompleto?.trim()
            ? input.motivoIncompleto.trim()
            : null,
        observacao_operador: input.observacaoOperador?.trim() ? input.observacaoOperador.trim() : null,
        atualizado_em: atualizadoEm,
        atualizado_por: input.operadorNome,
        operador_nome: input.operadorNome,
        cancelado_em: statusFinal === "Cancelado" ? atualizadoEm : null,
      };

      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          await updateDoc(doc(db, CHAMADOS_COLLECTION, id), payload);
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Permissão negada ao atualizar pedido de televendas. Verifique login e unidade."
          );
        }
        return;
      }

      setChamados((prev) =>
        prev.map((chamado) => (chamado.id === id ? { ...chamado, ...payload } : chamado))
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
    aguardando: chamadosEscopo.filter((c) => c.status === "Aguardando" || c.status === "Aberto").length,
    emAtendimento: chamadosEscopo.filter(
      (c) =>
        c.status === "Em atendimento" ||
        c.status === "Em separação" ||
        c.status === "Incompleto" ||
        c.status === "Pronto"
    ).length,
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
    atualizarItensTelevendas,
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
