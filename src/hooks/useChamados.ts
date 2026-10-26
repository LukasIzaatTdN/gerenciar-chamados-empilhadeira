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
} from "../utils/televendasItems";
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  type FirestoreError,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";
import {
  isEmpilhadeiraCompativelComChamado,
  type EmpilhadeiraStatus,
} from "../types/empilhadeira";
import { LEGACY_EMPRESA_ID, resolveEmpresaId } from "../utils/tenant";
import { assertBusinessScope, assertUserAccess, createAuditEntry } from "../utils/businessRules";
import { runCallbackSafely } from "../utils/runCallbackSafely";
import { buildSeparationConfirmation, getConfirmedQuantityForItem, hasForkliftReceiptForItem } from "../utils/separationConfirmation";
import {
  buildTelevendasLinkedListenerPlan,
  createListenerCallbackLease,
  diffTelevendasLinkedListenerPlan,
} from "../utils/televendasListenerPlan";

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
      : []
  );
  const totaisTelevendas = getTotaisItensTelevendas(itensTelevendas);
  const possuiItensEstruturados = Array.isArray((data as Partial<Chamado>).itens);

  return {
    id: typeof data.id === "string" && data.id.trim() ? data.id : fallbackId,
    categoria,
    pedido_origem_id: typeof data.pedido_origem_id === "string" ? data.pedido_origem_id : null,
    pedido_origem_item_index: typeof data.pedido_origem_item_index === "number" ? data.pedido_origem_item_index : null,
    pedido_origem_produto: typeof data.pedido_origem_produto === "string" ? data.pedido_origem_produto : null,
    localizacao_pallet: typeof data.localizacao_pallet === "string" ? data.localizacao_pallet : null,
    confirmacoes_empilhadeira: data.confirmacoes_empilhadeira && typeof data.confirmacoes_empilhadeira === "object"
      ? data.confirmacoes_empilhadeira
      : {},
    confirmacoes_manuais: data.confirmacoes_manuais && typeof data.confirmacoes_manuais === "object"
      ? data.confirmacoes_manuais
      : {},
    empresa_id: resolveEmpresaId(data.empresa_id, LEGACY_EMPRESA_ID),
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
    total_solicitado: possuiItensEstruturados ? totaisTelevendas.totalSolicitado : null,
    total_encontrado: possuiItensEstruturados ? totaisTelevendas.totalEncontrado : null,
    percentual_atendido: possuiItensEstruturados ? totaisTelevendas.percentualAtendido : null,
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
    empilhadeira_id:
      typeof (data as Partial<Chamado>).empilhadeira_id === "string" &&
      (data as Partial<Chamado>).empilhadeira_id!.trim()
        ? (data as Partial<Chamado>).empilhadeira_id!.trim()
        : null,
    empilhadeira_identificacao:
      typeof (data as Partial<Chamado>).empilhadeira_identificacao === "string" &&
      (data as Partial<Chamado>).empilhadeira_identificacao!.trim()
        ? (data as Partial<Chamado>).empilhadeira_identificacao!.trim()
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
  empresa_id: string;
  supermercado_id: string;
  categoria: CategoriaChamado;
  pedido_origem_id?: string | null;
  pedido_origem_item_index?: number | null;
  pedido_origem_produto?: string | null;
  localizacao_pallet?: string | null;
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
  onCriado?: (chamado: Chamado, auditId?: string) => void;
  onAssumido?: (chamado: Chamado, operadorNome: string, auditId?: string) => void;
  onIniciado?: (chamado: Chamado, auditId?: string) => void;
  onFinalizado?: (chamado: Chamado, auditId?: string) => void;
  onAtualizado?: (chamado: Chamado, auditId?: string) => void;
}

interface AtualizacaoItensTelevendasInput {
  itens: ItemTelevendas[];
  operadorNome: string;
  status: "Pronto" | "Incompleto" | "Cancelado";
  motivoIncompleto?: string | null;
  observacaoOperador?: string | null;
}

interface EquipamentoChamadoInput {
  id: string;
  identificacao: string;
  empresa_id: string;
  supermercado_id: string;
  status: EmpilhadeiraStatus;
}

interface ChamadoScope {
  empresaId: string | null;
  supermercadoId: string | null;
  canViewAllUnits: boolean;
  canViewAllCompanies: boolean;
  perfil?: string | null;
}

function canAccessChamado(chamado: Chamado, scope: ChamadoScope): boolean {
  if (scope.canViewAllCompanies) return true;
  if (!scope.empresaId) return false;
  if (chamado.empresa_id !== scope.empresaId) return false;
  if (scope.canViewAllUnits) return true;
  if (!scope.supermercadoId) return false;
  return chamado.supermercado_id === scope.supermercadoId;
}

function applyScope(chamados: Chamado[], scope: ChamadoScope): Chamado[] {
  if (scope.canViewAllCompanies) return chamados;
  if (!scope.empresaId) return [];
  const chamadosEmpresa = chamados.filter((c) => c.empresa_id === scope.empresaId);
  if (scope.canViewAllUnits) return chamadosEmpresa;
  if (!scope.supermercadoId) return [];
  return chamadosEmpresa.filter((c) => c.supermercado_id === scope.supermercadoId);
}

async function ensureFirebaseSessionForChamado() {
  if (!db) return;

  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
}

function getEquipamentoPayload(
  chamado: Chamado,
  equipamento?: EquipamentoChamadoInput | null
) {
  if (equipamento === undefined) {
    return {
      empilhadeira_id: chamado.empilhadeira_id ?? null,
      empilhadeira_identificacao: chamado.empilhadeira_identificacao ?? null,
    };
  }

  if (equipamento === null) {
    return {
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    };
  }

  if (equipamento.supermercado_id !== chamado.supermercado_id) {
    throw new Error("Selecione uma empilhadeira da mesma unidade do chamado.");
  }
  if (equipamento.empresa_id !== chamado.empresa_id) {
    throw new Error("Selecione uma empilhadeira da mesma empresa do chamado.");
  }

  if (!isEmpilhadeiraCompativelComChamado(equipamento.status)) {
    throw new Error("A empilhadeira selecionada não está disponível para este chamado.");
  }

  return {
    empilhadeira_id: equipamento.id,
    empilhadeira_identificacao: equipamento.identificacao,
  };
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
      if (scope.perfil === "Separador de Televendas") {
        setChamados([]);
        if (!scope.empresaId || !scope.supermercadoId) {
          setSyncError("Defina a empresa e a unidade do perfil para acompanhar os pedidos.");
          return;
        }

        const chamadosCollection = collection(db, CHAMADOS_COLLECTION);
        const orderQueries = [
          ["televendas-categoria", query(
            chamadosCollection,
            where("empresa_id", "==", scope.empresaId),
            where("supermercado_id", "==", scope.supermercadoId),
            where("categoria", "==", "televendas")
          )],
          ["televendas-legado", query(
            chamadosCollection,
            where("empresa_id", "==", scope.empresaId),
            where("supermercado_id", "==", scope.supermercadoId),
            where("tipo_servico", "==", "Atendimento Televendas")
          )],
        ] as const;
        const latestByQuery = new Map<string, Chamado[]>();
        const failedQueries = new Set<string>();
        let scopeActive = true;
        const linkedSubscriptions = new Map<string, { unsubscribe: () => void; lease: ReturnType<typeof createListenerCallbackLease> }>();
        const receivedInitialOrderQueries = new Set<string>();
        const orderQueryKeys = new Set(orderQueries.map(([key]) => key));
        let refreshLinkedListeners = () => {};
        const publishSnapshot = () => {
          const unique = new Map<string, Chamado>();
          for (const batch of latestByQuery.values()) {
            for (const chamado of batch) unique.set(chamado.id, chamado);
          }
          setChamados(sortChamados([...unique.values()]));
        };
        const onQueryError = (key: string, error: FirestoreError) => {
          if (!scopeActive) return;
          failedQueries.add(key);
          const code = error.code ? ` (${error.code})` : "";
          setSyncError(
            `Falha ao sincronizar pedidos e solicitações vinculadas${code}. Verifique login, perfil e regras do Firestore.`
          );
          if (orderQueryKeys.has(key)) {
            receivedInitialOrderQueries.add(key);
            refreshLinkedListeners();
          }
        };
        const onQuerySnapshot = (key: string, snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => {
          if (!scopeActive) return;
          latestByQuery.set(key, snapshot.docs.map((snapshotDoc) =>
            normalizeChamado(snapshotDoc.data() as Partial<Chamado>, snapshotDoc.id)
          ));
          failedQueries.delete(key);
          if (failedQueries.size === 0) setSyncError(null);
          publishSnapshot();
        };
        refreshLinkedListeners = () => {
          if (!scopeActive || receivedInitialOrderQueries.size !== orderQueries.length) return;
          const pedidos = [
            ...(latestByQuery.get("televendas-categoria") ?? []),
            ...(latestByQuery.get("televendas-legado") ?? []),
          ].filter(isTelevendasChamado);
          const plan = buildTelevendasLinkedListenerPlan(pedidos);
          const { removedKeys, addedChunks } = diffTelevendasLinkedListenerPlan(linkedSubscriptions.keys(), plan);
          let removedSubscriptions = false;

          for (const key of removedKeys) {
            const subscription = linkedSubscriptions.get(key);
            if (!subscription) continue;
            subscription.lease.revoke();
            subscription.unsubscribe();
            linkedSubscriptions.delete(key);
            latestByQuery.delete(`chamados-vinculados-${key}`);
            failedQueries.delete(`chamados-vinculados-${key}`);
            removedSubscriptions = true;
          }

          for (const { key: chunkKey, pedidoIds } of addedChunks) {
            const key = `chamados-vinculados-${chunkKey}`;
            const lease = createListenerCallbackLease();
            const linkedCallsQuery = query(
              chamadosCollection,
              where("empresa_id", "==", scope.empresaId),
              where("supermercado_id", "==", scope.supermercadoId),
              where("categoria", "==", "operacional"),
              where("pedido_origem_id", "in", pedidoIds)
            );
            const unsubscribe = onSnapshot(
              linkedCallsQuery,
              (snapshot) => {
                if (!scopeActive || !lease.isActive()) return;
                onQuerySnapshot(key, snapshot);
              },
              (error: FirestoreError) => {
                if (!scopeActive || !lease.isActive()) return;
                onQueryError(key, error);
              }
            );
            linkedSubscriptions.set(chunkKey, { unsubscribe, lease });
          }
          if (removedSubscriptions) publishSnapshot();
        };
        const orderSubscriptions = orderQueries.map(([key, pedidosQuery]) =>
          onSnapshot(
            pedidosQuery,
            (snapshot) => {
              if (!scopeActive) return;
              onQuerySnapshot(key, snapshot);
              receivedInitialOrderQueries.add(key);
              refreshLinkedListeners();
            },
            (error: FirestoreError) => onQueryError(key, error)
          )
        );
        return () => {
          scopeActive = false;
          orderSubscriptions.forEach((unsubscribe) => unsubscribe());
          linkedSubscriptions.forEach(({ unsubscribe, lease }) => {
            lease.revoke();
            unsubscribe();
          });
          linkedSubscriptions.clear();
        };
      }

      if (!scope.canViewAllCompanies && !scope.empresaId) {
        setChamados([]);
        return;
      }

      const chamadosQuery = scope.canViewAllCompanies
        ? query(collection(db, CHAMADOS_COLLECTION))
        : !scope.canViewAllUnits && scope.supermercadoId
          ? query(
              collection(db, CHAMADOS_COLLECTION),
              where("supermercado_id", "==", scope.supermercadoId)
            )
          : query(collection(db, CHAMADOS_COLLECTION), where("empresa_id", "==", scope.empresaId));

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
  }, [isRemoteSyncEnabled, scope.canViewAllCompanies, scope.empresaId, scope.perfil, scope.supermercadoId]);

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
      const isPedidoTelevendas =
        input.categoria === "televendas" || input.tipo_servico === "Atendimento Televendas";
      const pedidoOrigemId = input.pedido_origem_id?.trim() || "";
      if (
        scope.perfil === "Separador de Televendas"
        && !isPedidoTelevendas
        && !pedidoOrigemId
      ) {
        throw new Error("O Separador de Televendas só pode abrir chamados operacionais vinculados a um pedido.");
      }
      if (scope.perfil === "Separador de Televendas" && !isPedidoTelevendas) {
        const pedidoOrigem = chamados.find((chamado) => chamado.id === pedidoOrigemId);
        const itemIndex = input.pedido_origem_item_index;
        const itemOrigem = typeof itemIndex === "number" ? pedidoOrigem?.itens?.[itemIndex] : undefined;
        if (
          !pedidoOrigem
          || !isTelevendasChamado(pedidoOrigem)
          || pedidoOrigem.status !== "Em separação"
          || pedidoOrigem.empresa_id !== input.empresa_id
          || pedidoOrigem.supermercado_id !== input.supermercado_id
          || !Number.isInteger(itemIndex)
          || itemIndex! < 0
          || !itemOrigem
          || itemOrigem.produto.trim() !== input.pedido_origem_produto?.trim()
        ) {
          throw new Error("O pedido, item ou escopo do chamado vinculado não é válido.");
        }
      }

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: input.empresa_id,
        targetSupermercadoId: input.supermercado_id,
        entityName: "chamado",
      });

      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "create_chamado",
      });

      const itensTelevendas =
        input.categoria === "televendas" ? normalizeItensTelevendas(input.itens ?? []) : [];
      const totaisTelevendas = getTotaisItensTelevendas(itensTelevendas);

      const novo: Chamado = {
        id: uuidv4(),
        categoria:
          input.categoria === "televendas" || input.tipo_servico === "Atendimento Televendas"
            ? "televendas"
            : "operacional",
        pedido_origem_id: input.pedido_origem_id?.trim() || null,
        pedido_origem_item_index: input.pedido_origem_item_index ?? null,
        pedido_origem_produto: input.pedido_origem_produto?.trim() || null,
        localizacao_pallet: input.localizacao_pallet?.trim() || null,
        empresa_id: resolveEmpresaId(input.empresa_id, LEGACY_EMPRESA_ID),
        supermercado_id: input.supermercado_id,
        solicitante_nome: input.solicitante_nome,
        solicitante_uid: auth?.currentUser?.uid ?? null,
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
        empilhadeira_id: null,
        empilhadeira_identificacao: null,
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

      let auditId: string | undefined;
      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          const batch = writeBatch(db);
          const auditRef = doc(collection(db, "auditoria"));
          auditId = auditRef.id;
          batch.set(doc(collection(db, CHAMADOS_COLLECTION), novo.id), novo);
          batch.set(
            auditRef,
            createAuditEntry({
              action: "chamado_criado",
              actorUid: auth?.currentUser?.uid,
              actorName: input.solicitante_nome || "Sistema",
              entityType: "chamado",
              entityId: novo.id,
              details: {
                empresa_id: novo.empresa_id,
                supermercado_id: novo.supermercado_id,
                setor: novo.setor,
                tipo_servico: novo.tipo_servico,
                prioridade: novo.prioridade,
                status: novo.status,
                ...(novo.pedido_origem_id ? {
                  pedido_origem_id: novo.pedido_origem_id,
                  pedido_origem_item_index: novo.pedido_origem_item_index,
                  pedido_origem_produto: novo.pedido_origem_produto,
                  localizacao_pallet: novo.localizacao_pallet,
                } : {}),
              },
            })
          );
          await batch.commit();
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível abrir o chamado."
          );
        }
      } else {
        setChamados((prev) => [...prev, novo]);
      }

      runCallbackSafely(() => callbacks?.onCriado?.(novo, auditId), "chamado creation");
    },
    [callbacks, scope.canViewAllCompanies, scope.canViewAllUnits, scope.empresaId, scope.supermercadoId]
  );

  const assumirChamado = useCallback(
    async (
      id: string,
      operadorNome: string,
      equipamento?: EquipamentoChamadoInput | null
    ) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }
      const equipamentoPayload = getEquipamentoPayload(chamadoAtual, equipamento);

      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "assume_chamado",
      });

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: chamadoAtual.empresa_id,
        targetSupermercadoId: chamadoAtual.supermercado_id,
        entityName: "chamado",
      });

      let auditId: string | undefined;
      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          const batch = writeBatch(db);
          const auditRef = doc(collection(db, "auditoria"));
          auditId = auditRef.id;
          batch.update(doc(db, CHAMADOS_COLLECTION, id), {
            status: isTelevendasChamado(chamadoAtual) ? ("Em separação" as Status) : ("Aguardando" as Status),
            operador_nome: operadorNome,
            assumido_em: chamadoAtual.assumido_em ?? new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            ...equipamentoPayload,
          });
          batch.set(
            auditRef,
            createAuditEntry({
              action: "chamado_assumido",
              actorUid: auth?.currentUser?.uid,
              actorName: operadorNome,
              entityType: "chamado",
              entityId: id,
              details: {
                empresa_id: chamadoAtual.empresa_id,
                supermercado_id: chamadoAtual.supermercado_id,
                statusAnterior: chamadoAtual.status,
                statusAtual: isTelevendasChamado(chamadoAtual) ? "Em separação" : "Aguardando",
                operador_nome: operadorNome,
              },
            })
          );
          await batch.commit();
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível assumir o chamado."
          );
        }
        runCallbackSafely(
          () => callbacks?.onAssumido?.(
            { ...chamadoAtual, operador_nome: operadorNome },
            operadorNome,
            auditId
          ),
          "chamado assignment"
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
                ...equipamentoPayload,
              }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(
            () => runCallbackSafely(() => callbacks?.onAssumido?.(chamado, operadorNome), "chamado assignment"),
            0
          );
        }
        return updated;
      });
    },
    [callbacks, chamados, scope]
  );

  const iniciarAtendimento = useCallback(
    async (
      id: string,
      operadorNome: string,
      equipamento?: EquipamentoChamadoInput | null
    ) => {
      const chamadoAtual = chamados.find((c) => c.id === id);
      if (!chamadoAtual) {
        throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      }
      if (!canAccessChamado(chamadoAtual, scope)) {
        throw new Error("Você não tem acesso a este chamado.");
      }
      const equipamentoPayload = getEquipamentoPayload(chamadoAtual, equipamento);

      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "start_chamado",
      });

      const iniciado_em = new Date().toISOString();
      const operador_nome = operadorNome;

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: chamadoAtual.empresa_id,
        targetSupermercadoId: chamadoAtual.supermercado_id,
        entityName: "chamado",
      });

      let auditId: string | undefined;
      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          const batch = writeBatch(db);
          const auditRef = doc(collection(db, "auditoria"));
          auditId = auditRef.id;
          batch.update(doc(db, CHAMADOS_COLLECTION, id), {
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
            ...equipamentoPayload,
          });
          batch.set(
            auditRef,
            createAuditEntry({
              action: "chamado_iniciado",
              actorUid: auth?.currentUser?.uid,
              actorName: operadorNome,
              entityType: "chamado",
              entityId: id,
              details: {
                empresa_id: chamadoAtual.empresa_id,
                supermercado_id: chamadoAtual.supermercado_id,
                statusAnterior: chamadoAtual.status,
                statusAtual: isTelevendasChamado(chamadoAtual) ? "Pronto" : "Em atendimento",
                operador_nome: operadorNome,
              },
            })
          );
          await batch.commit();
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível iniciar o atendimento."
          );
        }
        runCallbackSafely(
          () => callbacks?.onIniciado?.({
            ...chamadoAtual,
            status: isTelevendasChamado(chamadoAtual) ? "Pronto" : "Em atendimento",
            iniciado_em,
            operador_nome,
          }, auditId),
          "chamado start"
        );
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
                ...equipamentoPayload,
              }
            : c
        );
        const chamado = updated.find((c) => c.id === id);
        if (chamado) {
          setTimeout(() => runCallbackSafely(() => callbacks?.onIniciado?.(chamado), "chamado start"), 0);
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

      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "finish_chamado",
      });

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: chamadoAtual.empresa_id,
        targetSupermercadoId: chamadoAtual.supermercado_id,
        entityName: "chamado",
      });

      let auditId: string | undefined;
      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          const batch = writeBatch(db);
          const auditRef = doc(collection(db, "auditoria"));
          auditId = auditRef.id;
          batch.update(doc(db, CHAMADOS_COLLECTION, id), {
            status: "Finalizado" as Status,
            finalizado_em,
            operador_nome,
            cancelado_em: null,
            atualizado_em: finalizado_em,
            atualizado_por: operador_nome,
          });
          batch.set(
            auditRef,
            createAuditEntry({
              action: "chamado_finalizado",
              actorUid: auth?.currentUser?.uid,
              actorName: operadorNome,
              entityType: "chamado",
              entityId: id,
              details: {
                empresa_id: chamadoAtual.empresa_id,
                supermercado_id: chamadoAtual.supermercado_id,
                statusAnterior: chamadoAtual.status,
                statusAtual: "Finalizado",
                operador_nome: operadorNome,
              },
            })
          );
          await batch.commit();
        } catch (error) {
          throw mapFirestoreWriteError(
            error,
            "Não foi possível finalizar o chamado."
          );
        }
        runCallbackSafely(
          () => callbacks?.onFinalizado?.({
            ...chamadoAtual,
            status: "Finalizado",
            finalizado_em,
            operador_nome,
          }, auditId),
          "chamado completion"
        );
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
          setTimeout(() => runCallbackSafely(() => callbacks?.onFinalizado?.(chamado), "chamado completion"), 0);
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
            "Não foi possível marcar deslocamento."
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
            "Não foi possível registrar a chegada."
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
      if (!chamadoAtual) throw new Error("Chamado não encontrado. Atualize a tela e tente novamente.");
      if (!canAccessChamado(chamadoAtual, scope)) throw new Error("Você não tem acesso a este chamado.");
      if (!isTelevendasChamado(chamadoAtual)) throw new Error("Esta ação é exclusiva para pedidos de televendas.");

      const itensNormalizados = normalizeItensTelevendas(input.itens);
      const totais = getTotaisItensTelevendas(itensNormalizados);
      const statusFinal: Status = input.status === "Incompleto" && !hasItemFaltante(itensNormalizados) ? "Pronto" : input.status;
      const atualizadoEm = new Date().toISOString();

      if (db) {
        try {
          await ensureFirebaseSessionForChamado();
          const currentUser = auth?.currentUser;
          if (!currentUser) throw new Error("Sessão expirada. Faça login novamente.");
          const orderRef = doc(db, CHAMADOS_COLLECTION, id);
          const initialSnapshot = await getDocFromServer(orderRef);
          if (!initialSnapshot.exists()) throw new Error("Pedido não encontrado. Atualize a tela.");
          const initialOrder = normalizeChamado(initialSnapshot.data() as Partial<Chamado>, initialSnapshot.id);
          if (initialOrder.status !== chamadoAtual.status || initialOrder.itens.some((item, index) =>
            item.quantidadeEncontrada !== chamadoAtual.itens[index]?.quantidadeEncontrada)) {
            throw new Error("O pedido foi atualizado por outra pessoa. Atualize os dados antes de salvar novamente.");
          }
          const hasPriorReceipts = Object.keys(initialOrder.confirmacoes_empilhadeira ?? {}).length > 0 ||
            Object.keys(initialOrder.confirmacoes_manuais ?? {}).length > 0;
          let manualReceiptsApplied = false;
          if (hasPriorReceipts) {
            if (!functions) throw new Error("Confirmação manual segura indisponível sem conexão com o Firebase.");
            for (let index = 0; index < itensNormalizados.length; index += 1) {
              const target = itensNormalizados[index]?.quantidadeEncontrada;
              const current = initialOrder.itens[index]?.quantidadeEncontrada;
              if (target == null || current == null || target === current) continue;
              if (target < current) throw new Error("Após uma confirmação registrada, as quantidades só podem ser acrescentadas.");
              if (hasForkliftReceiptForItem(initialOrder, index)) {
                throw new Error("Este item já teve o recebimento da empilhadeira confirmado e não pode ser editado manualmente.");
              }
              await httpsCallable(functions, "confirmManualTelevendasItem")({
                pedidoId: id, operationId: uuidv4(), itemIndex: index, targetQuantity: target,
              });
              manualReceiptsApplied = true;
            }
          }
          const auditRef = doc(collection(db, "auditoria"));
          await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(orderRef);
            if (!snapshot.exists()) throw new Error("Pedido não encontrado. Atualize a tela.");
            const atual = normalizeChamado(snapshot.data() as Partial<Chamado>, snapshot.id);
            if (!isTelevendasChamado(atual) || !canAccessChamado(atual, scope)) throw new Error("O pedido está fora do escopo autorizado.");
            const quantitiesChanged = atual.itens.length !== chamadoAtual.itens.length ||
              atual.itens.some((item, index) => item.quantidadeEncontrada !== chamadoAtual.itens[index]?.quantidadeEncontrada);
            if (atual.status !== chamadoAtual.status || (quantitiesChanged && !manualReceiptsApplied)) {
              throw new Error("O pedido foi atualizado por outra pessoa. Atualize os dados antes de salvar novamente.");
            }
            const manualQuantitiesChanged = itensNormalizados.length !== atual.itens.length ||
              itensNormalizados.some((item, index) => item.quantidadeEncontrada !== atual.itens[index]?.quantidadeEncontrada);
            if (manualReceiptsApplied && manualQuantitiesChanged) {
              throw new Error("Nem todas as confirmações manuais foram registradas. Atualize o pedido e tente novamente.");
            }
            itensNormalizados.forEach((item, index) => {
              if (item.quantidadeEncontrada < getConfirmedQuantityForItem(atual, index)) {
                throw new Error("A quantidade encontrada não pode ficar abaixo do total confirmado pelos chamados de empilhadeira.");
              }
            });
            const payload = {
              itens: itensNormalizados,
              produto: itensToLegacyProduto(itensNormalizados),
              quantidade: itensToLegacyQuantidade(itensNormalizados),
              total_solicitado: totais.totalSolicitado,
              total_encontrado: totais.totalEncontrado,
              percentual_atendido: totais.percentualAtendido,
              status: statusFinal,
              motivo_incompleto: statusFinal === "Incompleto" && input.motivoIncompleto?.trim() ? input.motivoIncompleto.trim() : null,
              observacao_operador: input.observacaoOperador?.trim() ? input.observacaoOperador.trim() : null,
              atualizado_em: atualizadoEm,
              atualizado_por: input.operadorNome,
              operador_nome: input.operadorNome,
              cancelado_em: statusFinal === "Cancelado" ? atualizadoEm : null,
              ultima_auditoria_atualizacao_id: auditRef.id,
            };
            transaction.update(orderRef, payload);
            transaction.set(auditRef, createAuditEntry({
              action: "chamado_atualizado", actorUid: currentUser.uid, actorName: input.operadorNome,
              entityType: "chamado", entityId: id,
              details: {
                empresa_id: atual.empresa_id, supermercado_id: atual.supermercado_id,
                statusAnterior: atual.status, statusAtual: statusFinal, operador_nome: input.operadorNome,
                atualizado_em: atualizadoEm, categoria: "televendas",
              },
            }));
          });
          runCallbackSafely(() => callbacks?.onAtualizado?.({ ...chamadoAtual, ...{
            itens: itensNormalizados, status: statusFinal, atualizado_em: atualizadoEm,
            total_solicitado: totais.totalSolicitado, total_encontrado: totais.totalEncontrado,
            percentual_atendido: totais.percentualAtendido,
          } }, auditRef.id), "televendas update");
        } catch (error) {
          throw mapFirestoreWriteError(error, "Não foi possível atualizar o pedido de Televendas.");
        }
        return;
      }
      setChamados((prev) => prev.map((chamado) => chamado.id === id ? {
        ...chamado, itens: itensNormalizados, status: statusFinal, atualizado_em: atualizadoEm,
        total_solicitado: totais.totalSolicitado, total_encontrado: totais.totalEncontrado,
        percentual_atendido: totais.percentualAtendido,
      } : chamado));
    },
    [callbacks, chamados, scope]
  );

  const confirmarSeparacaoEmpilhadeira = useCallback(
    async (pedidoId: string, chamadoId: string, itemIndex: number, quantidade: number, justificativa: string, actorName: string) => {
      if (!db) throw new Error("Confirmação de recebimento indisponível sem conexão com o Firebase.");
      if (scope.perfil !== "Separador de Televendas" || !scope.empresaId || !scope.supermercadoId) {
        throw new Error("Somente o Separador autorizado da unidade pode confirmar este recebimento.");
      }
      await ensureFirebaseSessionForChamado();
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("Sessão expirada. Faça login novamente.");
      const orderRef = doc(db, CHAMADOS_COLLECTION, pedidoId);
      const callRef = doc(db, CHAMADOS_COLLECTION, chamadoId);
      const receiptRef = doc(db, CHAMADOS_COLLECTION, pedidoId, "separacao_confirmacoes", chamadoId);
      const auditRef = doc(collection(db, "auditoria"));
      const atualizadoEm = new Date().toISOString();
      await runTransaction(db, async (transaction) => {
        const [orderSnapshot, callSnapshot, receiptSnapshot] = await Promise.all([
          transaction.get(orderRef), transaction.get(callRef), transaction.get(receiptRef),
        ]);
        if (!orderSnapshot.exists() || !callSnapshot.exists()) throw new Error("Pedido ou chamado não encontrado. Atualize a tela.");
        if (receiptSnapshot.exists()) throw new Error("O recebimento deste chamado já foi confirmado.");
        const pedido = normalizeChamado(orderSnapshot.data() as Partial<Chamado>, pedidoId);
        const chamado = normalizeChamado(callSnapshot.data() as Partial<Chamado>, chamadoId);
        if (!isTelevendasChamado(pedido) || pedido.empresa_id !== scope.empresaId || pedido.supermercado_id !== scope.supermercadoId) {
          throw new Error("O pedido está fora do escopo autorizado.");
        }
        const confirmation = buildSeparationConfirmation({
          pedido, chamado, itemIndex, quantidade, justificativa, actorUid: currentUser.uid,
        });
        const receipt = {
          id: chamadoId, pedido_id: pedidoId, chamado_id: chamadoId, item_index: itemIndex,
          produto: pedido.itens[itemIndex].produto, empresa_id: pedido.empresa_id,
          supermercado_id: pedido.supermercado_id, actor_uid: currentUser.uid,
          actor_nome: actorName.trim() || "Separador",
          quantidade, unidade_medida: confirmation.summary.unidade,
          justificativa: confirmation.justificativa, confirmado_em: serverTimestamp(),
        };
        const confirmacoes = { ...(pedido.confirmacoes_empilhadeira ?? {}), [chamadoId]: { item_index: itemIndex, quantidade, unidade_medida: confirmation.summary.unidade } };
        const requested = confirmation.itens.reduce((sum, item) => sum + item.quantidadeSolicitada, 0);
        const found = confirmation.itens.reduce((sum, item) => sum + item.quantidadeEncontrada, 0);
        const payload = {
          itens: confirmation.itens,
          total_solicitado: requested,
          total_encontrado: found,
          percentual_atendido: requested > 0 ? Math.round((found / requested) * 100) : 0,
          confirmacoes_empilhadeira: confirmacoes,
          ultima_separacao_confirmacao_id: chamadoId,
          ultima_auditoria_atualizacao_id: auditRef.id,
          atualizado_em: atualizadoEm,
          atualizado_por: actorName.trim() || "Separador",
          operador_nome: actorName.trim() || "Separador",
        };
        transaction.update(orderRef, payload);
        transaction.set(receiptRef, receipt);
        transaction.set(auditRef, createAuditEntry({
          action: "chamado_atualizado", actorUid: currentUser.uid, actorName: actorName.trim() || "Separador",
          entityType: "chamado", entityId: pedidoId,
          details: {
            empresa_id: pedido.empresa_id, supermercado_id: pedido.supermercado_id,
            statusAnterior: pedido.status, statusAtual: pedido.status,
            operador_nome: actorName.trim() || "Separador", atualizado_em: atualizadoEm, categoria: "televendas",
            separacao_confirmacao_id: chamadoId, item_index: itemIndex, quantidade,
            unidade_medida: confirmation.summary.unidade,
          },
        }));
      });
      const updatedOrder = chamados.find((call) => call.id === pedidoId);
      if (updatedOrder) runCallbackSafely(() => callbacks?.onAtualizado?.({
        ...updatedOrder,
        confirmacoes_empilhadeira: { ...(updatedOrder.confirmacoes_empilhadeira ?? {}), [chamadoId]: { item_index: itemIndex, quantidade, unidade_medida: pedido.itens[itemIndex].unidadeMedida } },
      }), "separation confirmation");
    },
    [callbacks, chamados, scope]
  );

  const chamadosNoEscopo = applyScope(chamados, scope);
  const chamadosEscopo = scope.perfil === "Separador de Televendas"
    ? (() => {
        const pedidosIds = new Set(chamadosNoEscopo.filter(isTelevendasChamado).map((pedido) => pedido.id));
        return chamadosNoEscopo.filter((chamado) =>
          isTelevendasChamado(chamado)
          || (
            chamado.categoria === "operacional"
            && typeof chamado.pedido_origem_id === "string"
            && pedidosIds.has(chamado.pedido_origem_id)
            && typeof chamado.pedido_origem_item_index === "number"
          )
        );
      })()
    : chamadosNoEscopo;

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
    confirmarSeparacaoEmpilhadeira,
    iniciarAtendimento,
    finalizarChamado,
    excluirChamado,
  };
}
  function mapFirestoreWriteError(error: unknown, fallback: string): Error {
    const firestoreError = error as FirestoreError | undefined;
    if (firestoreError?.code === "permission-denied") {
      return new Error(`${fallback} Verifique seu perfil e o vínculo com a unidade. (permission-denied)`);
    }
    if (firestoreError?.code === "unauthenticated") {
      return new Error(`${fallback} Faça login novamente. (unauthenticated)`);
    }
    if (firestoreError?.code === "unavailable") {
      return new Error(`${fallback} Verifique sua conexão e tente novamente. (unavailable)`);
    }
    const details = [
      firestoreError?.code,
      error instanceof Error ? error.message : null,
    ]
      .filter(Boolean)
      .join(": ");
    return new Error(details ? `${fallback} (${details})` : fallback);
  }
