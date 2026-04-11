import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Manutencao, NovaManutencaoInput } from "../types/manutencao";
import type { Empilhadeira } from "../types/empilhadeira";

const MANUTENCOES_COLLECTION = "manutencoes";

interface ManutencaoScope {
  supermercadoId: string | null;
  canViewAll: boolean;
}

function normalizeManutencao(data: Partial<Manutencao>, fallbackId: string): Manutencao {
  return {
    id: data.id ?? fallbackId,
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

  useEffect(() => {
    if (!db) {
      setManutencoes([]);
      return;
    }

    if (!scope.canViewAll && !scope.supermercadoId) {
      setManutencoes([]);
      return;
    }

    return onSnapshot(
      collection(db, MANUTENCOES_COLLECTION),
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeManutencao(snapshotDoc.data() as Partial<Manutencao>, snapshotDoc.id)
          )
          .filter((item) => scope.canViewAll || item.supermercado_id === scope.supermercadoId)
          .sort(
            (a, b) =>
              new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime()
          );

        setManutencoes(remote);
      },
      () => setManutencoes([])
    );
  }, [scope.canViewAll, scope.supermercadoId]);

  const createManutencao = useCallback(
    async (input: NovaManutencaoInput, empilhadeira: Empilhadeira) => {
      if (empilhadeira.supermercado_id !== input.supermercado_id) {
        throw new Error("A empilhadeira selecionada não pertence à unidade informada.");
      }

      if (!scope.canViewAll && scope.supermercadoId !== input.supermercado_id) {
        throw new Error("Você só pode registrar manutenções da sua própria unidade.");
      }

      const id = db ? doc(collection(db, MANUTENCOES_COLLECTION)).id : createLocalId();
      const nova = normalizeManutencao({ ...input, id }, id);

      if (db) {
        await setDoc(doc(db, MANUTENCOES_COLLECTION, id), nova);
        return;
      }

      setManutencoes((prev) => [nova, ...prev]);
    },
    [scope.canViewAll, scope.supermercadoId]
  );

  const updateManutencao = useCallback(
    async (id: string, input: Partial<NovaManutencaoInput>) => {
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
        await updateDoc(doc(db, MANUTENCOES_COLLECTION, id), payload);
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
    createManutencao,
    updateManutencao,
  };
}
