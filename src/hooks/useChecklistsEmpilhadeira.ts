import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type {
  ChecklistEmpilhadeira,
  NovoChecklistEmpilhadeiraInput,
} from "../types/checklistEmpilhadeira";
import type { Empilhadeira } from "../types/empilhadeira";
import {
  getChecklistEmpilhadeiraItensReprovados,
  getChecklistEmpilhadeiraOcorrencia,
} from "../utils/checklistEmpilhadeira";
import { resolveEmpresaId } from "../utils/tenant";
import { matchesFirestoreUnitScope, queryByUnitScope } from "../utils/firestoreUnitScope";

const CHECKLISTS_COLLECTION = "checklists_empilhadeira";

interface ChecklistScope {
  userId?: string | null;
  empresaId: string | null;
  supermercadoId: string | null;
  supermercadoIds?: string[];
  canViewAllUnits: boolean;
  canViewAllCompanies: boolean;
}

function normalizeChecklist(
  data: Partial<ChecklistEmpilhadeira>,
  fallbackId: string
): ChecklistEmpilhadeira {
  return {
    id: data.id ?? fallbackId,
    empresa_id: resolveEmpresaId(data.empresa_id),
    supermercado_id: data.supermercado_id ?? "",
    empilhadeira_id: data.empilhadeira_id ?? "",
    operador_id: data.operador_id ?? "",
    operador_nome: data.operador_nome?.trim() || "Operador",
    data: data.data ?? new Date().toISOString().slice(0, 10),
    bateria_ok: Boolean(data.bateria_ok),
    garfo_ok: Boolean(data.garfo_ok),
    pneus_ok: Boolean(data.pneus_ok),
    freio_ok: Boolean(data.freio_ok),
    sem_avaria: Boolean(data.sem_avaria),
    reprovado: Boolean(data.reprovado),
    itens_reprovados: Array.isArray(data.itens_reprovados)
      ? data.itens_reprovados.filter((item): item is string => typeof item === "string")
      : [],
    ocorrencia_tecnica:
      typeof data.ocorrencia_tecnica === "string" && data.ocorrencia_tecnica.trim()
        ? data.ocorrencia_tecnica.trim()
        : null,
    observacoes: typeof data.observacoes === "string" && data.observacoes.trim()
      ? data.observacoes.trim()
      : null,
    tratado_em:
      typeof data.tratado_em === "string" && data.tratado_em.trim()
        ? data.tratado_em.trim()
        : null,
    tratado_por:
      typeof data.tratado_por === "string" && data.tratado_por.trim()
        ? data.tratado_por.trim()
        : null,
    criado_em: data.criado_em ?? new Date().toISOString(),
  };
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `chk-${Date.now()}`;
}

export function useChecklistsEmpilhadeira(scope: ChecklistScope) {
  const [checklists, setChecklists] = useState<ChecklistEmpilhadeira[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setChecklists([]);
      setSyncError(null);
      return;
    }
    setChecklists([]);
    setSyncError(null);
    const checklistsQuery = queryByUnitScope(
      collection(db, CHECKLISTS_COLLECTION),
      "supermercado_id",
      scope
    );
    if (!checklistsQuery) {
      setChecklists([]);
      return;
    }

    return onSnapshot(
      checklistsQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeChecklist(
              snapshotDoc.data() as Partial<ChecklistEmpilhadeira>,
              snapshotDoc.id
            )
          )
          .filter((item) => matchesFirestoreUnitScope(scope, item.empresa_id, item.supermercado_id))
          .sort(
            (a, b) =>
              new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
          );

        setChecklists(remote);
      },
      (error) => {
        console.warn("[firestore] checklists.listen failed", {
          operation: "checklists_empilhadeira.listen",
          collection: CHECKLISTS_COLLECTION,
          code: error.code || "unknown",
        });
        setSyncError(`Falha ao sincronizar checklists (${error.code || "unknown"}).`);
        setChecklists([]);
      }
    );
  }, [scope.userId, scope.canViewAllCompanies, scope.empresaId, scope.supermercadoId, scope.supermercadoIds?.join("|")]);

  const createChecklist = useCallback(
    async (
      input: NovoChecklistEmpilhadeiraInput,
      empilhadeira: Empilhadeira
    ) => {
      if (empilhadeira.empresa_id !== input.empresa_id) {
        throw new Error("A empilhadeira selecionada não pertence à empresa informada.");
      }
      if (empilhadeira.supermercado_id !== input.supermercado_id) {
        throw new Error("A empilhadeira selecionada não pertence à unidade informada.");
      }

      if (!scope.canViewAllCompanies && scope.empresaId !== input.empresa_id) {
        throw new Error("Você só pode registrar checklist da sua própria empresa.");
      }

      if (!scope.canViewAllUnits && scope.supermercadoId !== input.supermercado_id) {
        throw new Error("Você só pode registrar checklist da sua própria unidade.");
      }

      const itensReprovados = getChecklistEmpilhadeiraItensReprovados(input);
      const reprovado = itensReprovados.length > 0;
      const ocorrenciaTecnica = getChecklistEmpilhadeiraOcorrencia(input);

      const id = db ? doc(collection(db, CHECKLISTS_COLLECTION)).id : createLocalId();
      const novo: ChecklistEmpilhadeira = {
        id,
        empresa_id: resolveEmpresaId(input.empresa_id),
        supermercado_id: input.supermercado_id,
        empilhadeira_id: input.empilhadeira_id,
        operador_id: input.operador_id,
        operador_nome: input.operador_nome.trim(),
        data: input.data,
        bateria_ok: input.bateria_ok,
        garfo_ok: input.garfo_ok,
        pneus_ok: input.pneus_ok,
        freio_ok: input.freio_ok,
        sem_avaria: input.sem_avaria,
        reprovado,
        itens_reprovados: itensReprovados,
        ocorrencia_tecnica: ocorrenciaTecnica,
        observacoes:
          typeof input.observacoes === "string" && input.observacoes.trim()
            ? input.observacoes.trim()
            : null,
        tratado_em: null,
        tratado_por: null,
        criado_em: new Date().toISOString(),
      };

      if (db) {
        try {
          await setDoc(doc(db, CHECKLISTS_COLLECTION, id), novo);
        } catch (error) {
          throw mapFirestoreChecklistError(
            error,
            "Falha ao registrar checklist antes do turno."
          );
        }
        return;
      }

      setChecklists((prev) => [novo, ...prev]);
    },
    [scope.canViewAllCompanies, scope.canViewAllUnits, scope.empresaId, scope.supermercadoId, scope.supermercadoIds?.join("|")]
  );

  return {
    checklists,
    syncError,
    createChecklist,
  };
}

function mapFirestoreChecklistError(error: unknown, fallback: string): Error {
  const firestoreError = error as FirestoreError | undefined;

  if (firestoreError?.code === "permission-denied") {
    return new Error(`${fallback} Verifique login, empresa/unidade e regras do Firestore. (permission-denied)`);
  }
  if (firestoreError?.code === "unauthenticated") {
    return new Error(`${fallback} Sessão expirada, faça login novamente. (unauthenticated)`);
  }
  if (firestoreError?.code === "unavailable") {
    return new Error(`${fallback} Firebase indisponível no momento. (unavailable)`);
  }

  return new Error(fallback);
}
