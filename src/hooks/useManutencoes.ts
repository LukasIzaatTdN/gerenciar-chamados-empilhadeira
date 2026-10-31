import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { Manutencao, NovaManutencaoInput } from "../types/manutencao";
import type { Empilhadeira } from "../types/empilhadeira";
import { resolveEmpresaId } from "../utils/tenant";
import { assertBusinessScope, assertUserAccess, createAuditEntry } from "../utils/businessRules";
import { matchesFirestoreUnitScope, queryByUnitScope } from "../utils/firestoreUnitScope";

const MANUTENCOES_COLLECTION = "manutencoes";

interface ManutencaoScope {
  userId?: string | null;
  empresaId: string | null;
  supermercadoId: string | null;
  supermercadoIds?: string[];
  canViewAllUnits: boolean;
  canViewAllCompanies: boolean;
  perfil?: string | null;
}

function normalizeManutencao(data: Partial<Manutencao>, fallbackId: string): Manutencao {
  return {
    id: data.id ?? fallbackId,
    empresa_id: resolveEmpresaId(data.empresa_id),
    supermercado_id: data.supermercado_id ?? "",
    empilhadeira_id: data.empilhadeira_id ?? "",
    tipo: data.tipo ?? "Corretiva",
    descricao: data.descricao?.trim() || "Manutenção sem descrição",
    prioridade: data.prioridade ?? "Media",
    status: data.status ?? "Aberta",
    responsavel: data.responsavel?.trim() || null,
    data_abertura: data.data_abertura ?? new Date().toISOString(),
    data_prevista: data.data_prevista ?? null,
    data_conclusao: data.data_conclusao ?? null,
    criado_por: data.criado_por?.trim() || "Sistema",
    observacoes: data.observacoes?.trim() || null,
  };
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `mnt-${Date.now()}`;
}

export function useManutencoes(scope: ManutencaoScope) {
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setManutencoes([]);
      setSyncError(null);
      return;
    }
    setManutencoes([]);
    setSyncError(null);
    const manutencoesQuery = queryByUnitScope(
      collection(db, MANUTENCOES_COLLECTION),
      "supermercado_id",
      scope
    );
    if (!manutencoesQuery) {
      setManutencoes([]);
      return;
    }

    return onSnapshot(
      manutencoesQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeManutencao(snapshotDoc.data() as Partial<Manutencao>, snapshotDoc.id)
          )
          .filter((item) => matchesFirestoreUnitScope(scope, item.empresa_id, item.supermercado_id))
          .sort(
            (a, b) =>
              new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime()
          );

        setManutencoes(remote);
      },
      (error) => {
        console.warn("[firestore] manutencoes.listen failed", {
          operation: "manutencoes.listen",
          collection: MANUTENCOES_COLLECTION,
          code: error.code || "unknown",
        });
        setSyncError(`Falha ao sincronizar manutenções (${error.code || "unknown"}).`);
        setManutencoes([]);
      }
    );
  }, [scope.userId, scope.canViewAllCompanies, scope.empresaId, scope.supermercadoId, scope.supermercadoIds?.join("|")]);

  const createManutencao = useCallback(
    async (input: NovaManutencaoInput, empilhadeira: Empilhadeira) => {
      if (empilhadeira.empresa_id !== input.empresa_id) {
        throw new Error("A empilhadeira selecionada não pertence à empresa informada.");
      }
      if (empilhadeira.supermercado_id !== input.supermercado_id) {
        throw new Error("A empilhadeira selecionada não pertence à unidade informada.");
      }

      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "manage_manutencao",
      });

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: input.empresa_id,
        targetSupermercadoId: input.supermercado_id,
        entityName: "manutenção",
      });

      const id = db ? doc(collection(db, MANUTENCOES_COLLECTION)).id : createLocalId();
      const nova = normalizeManutencao({ ...input, id }, id);

      if (db) {
        const batch = writeBatch(db);
        batch.set(doc(db, MANUTENCOES_COLLECTION, id), nova);
        batch.set(
          doc(collection(db, "auditoria")),
          createAuditEntry({
            action: "manutencao_criada",
            actorUid: auth?.currentUser?.uid,
            actorName: input.criado_por || "Sistema",
            entityType: "manutencao",
            entityId: id,
            details: {
              empresa_id: nova.empresa_id,
              supermercado_id: nova.supermercado_id,
              empilhadeira_id: nova.empilhadeira_id,
              tipo: nova.tipo,
              status: nova.status,
              prioridade: nova.prioridade,
            },
          })
        );
        await batch.commit();
        return;
      }

      setManutencoes((prev) => [nova, ...prev]);
    },
    [scope.canViewAllCompanies, scope.canViewAllUnits, scope.empresaId, scope.supermercadoId]
  );

  const updateManutencao = useCallback(
    async (id: string, input: Partial<NovaManutencaoInput>) => {
      const current = manutencoes.find((item) => item.id === id);
      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: current?.empresa_id ?? input.empresa_id ?? null,
        targetSupermercadoId: current?.supermercado_id ?? input.supermercado_id ?? null,
        entityName: "manutenção",
      });

      const payload = {
        ...input,
        responsavel:
          typeof input.responsavel === "string"
            ? input.responsavel.trim()
            : input.responsavel ?? null,
        observacoes:
          typeof input.observacoes === "string"
            ? input.observacoes.trim()
            : input.observacoes ?? null,
      };

      if (db) {
        const batch = writeBatch(db);
        batch.update(doc(db, MANUTENCOES_COLLECTION, id), payload);
        batch.set(
          doc(collection(db, "auditoria")),
          createAuditEntry({
            action: "manutencao_atualizada",
            actorUid: auth?.currentUser?.uid,
            actorName: current?.criado_por || "Sistema",
            entityType: "manutencao",
            entityId: id,
            details: {
              empresa_id: payload.empresa_id ?? current?.empresa_id ?? null,
              supermercado_id: payload.supermercado_id ?? current?.supermercado_id ?? null,
              statusAnterior: current?.status ?? null,
              statusAtual: payload.status ?? current?.status ?? null,
            },
          })
        );
        await batch.commit();
        return;
      }

      setManutencoes((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
      );
    },
    []
  );

  return {
    manutencoes,
    syncError,
    createManutencao,
    updateManutencao,
  };
}
