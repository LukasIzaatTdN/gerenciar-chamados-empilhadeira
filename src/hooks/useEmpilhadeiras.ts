import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { Empilhadeira, EmpilhadeiraStatus } from "../types/empilhadeira";

const EMPILHADEIRAS_COLLECTION = "empilhadeiras";

interface EmpilhadeiraScope {
  empresaId: string | null;
  supermercadoId: string | null;
  canViewAllUnits: boolean;
  canViewAllCompanies: boolean;
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
          await updateDoc(doc(db, EMPILHADEIRAS_COLLECTION, id), payload);
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
      const atualizado_em = new Date().toISOString();

      try {
        if (db) {
          await updateDoc(doc(db, EMPILHADEIRAS_COLLECTION, id), {
            status,
            atualizado_em,
          });
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
    []
  );

  return {
    empilhadeiras,
    isRemoteSyncEnabled,
    createEmpilhadeira,
    updateEmpilhadeira,
    updateEmpilhadeiraStatus,
  };
}
