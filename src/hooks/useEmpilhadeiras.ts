import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { Empilhadeira, EmpilhadeiraStatus } from "../types/empilhadeira";
import { assertBusinessScope, assertUserAccess, createAuditEntry } from "../utils/businessRules";

const EMPILHADEIRAS_COLLECTION = "empilhadeiras";

interface EmpilhadeiraScope {
  empresaId: string | null;
  supermercadoId: string | null;
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
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    const firestore = db;
    if (!firestore) {
      setEmpilhadeiras([]);
      return;
    }

    if (!scope.canViewAllCompanies && !scope.empresaId) {
      setEmpilhadeiras([]);
      return;
    }

    const empilhadeirasQuery = scope.canViewAllCompanies
      ? query(collection(firestore, EMPILHADEIRAS_COLLECTION))
      : !scope.canViewAllUnits && scope.supermercadoId
        ? query(
            collection(firestore, EMPILHADEIRAS_COLLECTION),
            where("supermercado_id", "==", scope.supermercadoId)
          )
        : query(
          collection(firestore, EMPILHADEIRAS_COLLECTION),
          where("empresa_id", "==", scope.empresaId)
        );

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
          .filter((item) => scope.canViewAllCompanies || item.empresa_id === scope.empresaId)
          .filter((item) => scope.canViewAllUnits || item.supermercado_id === scope.supermercadoId)
          .sort(
            (a, b) =>
              new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime()
          );

        setEmpilhadeiras(remote);
      },
      () => {
        setEmpilhadeiras([]);
      }
    );
  }, [scope.canViewAllCompanies, scope.canViewAllUnits, scope.empresaId, scope.supermercadoId]);

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
          await setDoc(doc(db, EMPILHADEIRAS_COLLECTION, id), nova);
          await addDoc(
            collection(db, "auditoria"),
            createAuditEntry({
              action: "empilhadeira_criada",
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
          await updateDoc(doc(db, EMPILHADEIRAS_COLLECTION, id), payload);
          await addDoc(
            collection(db, "auditoria"),
            createAuditEntry({
              action: "empilhadeira_atualizada",
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
          await updateDoc(doc(db, EMPILHADEIRAS_COLLECTION, id), {
            status,
            atualizado_em,
          });
          await addDoc(
            collection(db, "auditoria"),
            createAuditEntry({
              action: "empilhadeira_status_alterado",
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
    isRemoteSyncEnabled,
    createEmpilhadeira,
    updateEmpilhadeira,
    updateEmpilhadeiraStatus,
  };
}
