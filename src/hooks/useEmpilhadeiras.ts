import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { Empilhadeira, EmpilhadeiraStatus } from "../types/empilhadeira";
import { assertBusinessScope, assertUserAccess, createAuditEntry } from "../utils/businessRules";
import { matchesFirestoreUnitScope, queryByUnitScope } from "../utils/firestoreUnitScope";

const EMPILHADEIRAS_COLLECTION = "empilhadeiras";

interface EmpilhadeiraScope {
  userId?: string | null;
  empresaId: string | null;
  supermercadoId: string | null;
  supermercadoIds?: string[];
  canViewAllUnits: boolean;
  canViewAllCompanies: boolean;
  perfil?: string | null;
}

function normalizeEmpilhadeira(
  data: Partial<Empilhadeira>,
  fallbackId: string
): Empilhadeira {
  const now = new Date().toISOString();

  return {
    id: data.id ?? fallbackId,
    empresa_id: data.empresa_id ?? "empresa-padrao",
    supermercado_id: data.supermercado_id ?? "",
    identificacao: data.identificacao ?? "Empilhadeira sem identificação",
    modelo: data.modelo ?? "Modelo não informado",
    numero_interno: data.numero_interno ?? "N/I",
    status: data.status ?? "Disponível",
    observacoes: data.observacoes ?? "",
    criado_em: data.criado_em ?? now,
    atualizado_em: data.atualizado_em ?? data.criado_em ?? now,
  };
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `emp-${Date.now()}`;
}

export function useEmpilhadeiras(scope: EmpilhadeiraScope) {
  const [empilhadeiras, setEmpilhadeiras] = useState<Empilhadeira[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    const firestore = db;
    if (!firestore) {
      setEmpilhadeiras([]);
      setSyncError(null);
      return;
    }
    setEmpilhadeiras([]);
    setSyncError(null);
    const empilhadeirasQuery = queryByUnitScope(
      collection(firestore, EMPILHADEIRAS_COLLECTION),
      "supermercado_id",
      scope
    );
    if (!empilhadeirasQuery) {
      setEmpilhadeiras([]);
      return;
    }

    return onSnapshot(
      empilhadeirasQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeEmpilhadeira(
              snapshotDoc.data() as Partial<Empilhadeira>,
              snapshotDoc.id
            )
          )
          .filter((item) => matchesFirestoreUnitScope(scope, item.empresa_id, item.supermercado_id))
          .sort(
            (a, b) =>
              new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime()
          );

        setEmpilhadeiras(remote);
      },
      (error) => {
        console.warn("[firestore] empilhadeiras.listen failed", {
          operation: "empilhadeiras.listen",
          collection: EMPILHADEIRAS_COLLECTION,
          code: error.code || "unknown",
        });
        setSyncError(`Falha ao sincronizar empilhadeiras (${error.code || "unknown"}).`);
        setEmpilhadeiras([]);
      }
    );
  }, [scope.userId, scope.canViewAllCompanies, scope.empresaId, scope.supermercadoId, scope.supermercadoIds?.join("|")]);

  const createEmpilhadeira = useCallback(
    async (input: {
      empresa_id: string;
      supermercado_id: string;
      identificacao: string;
      modelo: string;
      numero_interno: string;
      status: EmpilhadeiraStatus;
      observacoes: string;
    }) => {
      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil: scope.perfil ?? null,
        requiredAction: "manage_empilhadeira",
      });

      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: input.empresa_id,
        targetSupermercadoId: input.supermercado_id,
        entityName: "empilhadeira",
      });

      const now = new Date().toISOString();
      const id = db ? doc(collection(db, EMPILHADEIRAS_COLLECTION)).id : createLocalId();

      const nova: Empilhadeira = {
        id,
        empresa_id: input.empresa_id.trim(),
        supermercado_id: scope.canViewAllUnits ? input.supermercado_id : scope.supermercadoId ?? input.supermercado_id,
        identificacao: input.identificacao.trim(),
        modelo: input.modelo.trim(),
        numero_interno: input.numero_interno.trim(),
        status: input.status,
        observacoes: input.observacoes.trim(),
        criado_em: now,
        atualizado_em: now,
      };

      try {
        if (db) {
          const batch = writeBatch(db);
          batch.set(doc(db, EMPILHADEIRAS_COLLECTION, id), nova);
          batch.set(
            doc(collection(db, "auditoria")),
            createAuditEntry({
              action: "empilhadeira_criada",
              actorUid: auth?.currentUser?.uid,
              actorName: "Sistema",
              entityType: "empilhadeira",
              entityId: id,
              details: {
                empresa_id: nova.empresa_id,
                supermercado_id: nova.supermercado_id,
                identificacao: nova.identificacao,
                status: nova.status,
              },
            })
          );
          await batch.commit();
          return;
        }
      } catch {
        throw new Error("Sem permissão para cadastrar empilhadeira. Verifique o perfil do usuário.");
      }

      setEmpilhadeiras((prev) => [nova, ...prev]);
    },
    [scope.canViewAllUnits, scope.supermercadoId]
  );

  const updateEmpilhadeira = useCallback(
    async (
      id: string,
      input: {
        empresa_id: string;
        supermercado_id: string;
        identificacao: string;
        modelo: string;
        numero_interno: string;
        status: EmpilhadeiraStatus;
        observacoes: string;
      }
    ) => {
      const current = empilhadeiras.find((item) => item.id === id);
      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: current?.empresa_id ?? input.empresa_id,
        targetSupermercadoId: current?.supermercado_id ?? input.supermercado_id,
        entityName: "empilhadeira",
      });

      const payload = {
        empresa_id: input.empresa_id.trim(),
        supermercado_id: scope.canViewAllUnits ? input.supermercado_id : scope.supermercadoId ?? input.supermercado_id,
        identificacao: input.identificacao.trim(),
        modelo: input.modelo.trim(),
        numero_interno: input.numero_interno.trim(),
        status: input.status,
        observacoes: input.observacoes.trim(),
        atualizado_em: new Date().toISOString(),
      };

      try {
        if (db) {
          const previous = empilhadeiras.find((item) => item.id === id);
          const batch = writeBatch(db);
          batch.update(doc(db, EMPILHADEIRAS_COLLECTION, id), payload);
          batch.set(
            doc(collection(db, "auditoria")),
            createAuditEntry({
              action: "empilhadeira_atualizada",
              actorUid: auth?.currentUser?.uid,
              actorName: "Sistema",
              entityType: "empilhadeira",
              entityId: id,
              details: {
                empresa_id: payload.empresa_id,
                supermercado_id: payload.supermercado_id,
                statusAnterior: previous?.status ?? null,
                statusAtual: payload.status,
                identificacao: payload.identificacao,
              },
            })
          );
          await batch.commit();
          return;
        }
      } catch {
        throw new Error("Sem permissão para editar empilhadeira.");
      }

      setEmpilhadeiras((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );
    },
    [scope.canViewAllUnits, scope.supermercadoId]
  );

  const updateEmpilhadeiraStatus = useCallback(
    async (id: string, status: EmpilhadeiraStatus) => {
      const previous = empilhadeiras.find((item) => item.id === id);
      assertBusinessScope({
        canViewAllCompanies: scope.canViewAllCompanies,
        canViewAllUnits: scope.canViewAllUnits,
        currentCompanyId: scope.empresaId,
        currentSupermercadoId: scope.supermercadoId,
        targetCompanyId: previous?.empresa_id ?? scope.empresaId,
        targetSupermercadoId: previous?.supermercado_id ?? scope.supermercadoId,
        entityName: "empilhadeira",
      });

      const atualizado_em = new Date().toISOString();

      try {
        if (db) {
          const batch = writeBatch(db);
          batch.update(doc(db, EMPILHADEIRAS_COLLECTION, id), {
            status,
            atualizado_em,
          });
          batch.set(
            doc(collection(db, "auditoria")),
            createAuditEntry({
              action: "empilhadeira_status_alterado",
              actorUid: auth?.currentUser?.uid,
              actorName: "Sistema",
              entityType: "empilhadeira",
              entityId: id,
              details: {
                empresa_id: previous?.empresa_id ?? null,
                supermercado_id: previous?.supermercado_id ?? null,
                statusAnterior: previous?.status ?? null,
                statusAtual: status,
              },
            })
          );
          await batch.commit();
          return;
        }
      } catch {
        throw new Error("Sem permissão para alterar o status da empilhadeira.");
      }

      setEmpilhadeiras((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                atualizado_em,
              }
            : item
        )
      );
    },
    [empilhadeiras, scope.canViewAllCompanies, scope.canViewAllUnits, scope.empresaId, scope.supermercadoId]
  );

  return {
    empilhadeiras,
    syncError,
    isRemoteSyncEnabled,
    createEmpilhadeira,
    updateEmpilhadeira,
    updateEmpilhadeiraStatus,
  };
}
