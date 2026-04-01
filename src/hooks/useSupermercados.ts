import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { SUPERMERCADOS } from "../data/supermercados";
import type { Supermercado } from "../types/supermercado";

const SUPERMERCADOS_COLLECTION = "supermercados";

function normalizeSupermercado(
  data: Partial<Supermercado>,
  fallbackId: string
): Supermercado {
  return {
    id: data.id ?? fallbackId,
    nome: data.nome ?? "Unidade sem nome",
    codigo: data.codigo ?? "UND",
    endereco: data.endereco ?? "Endereço não informado",
    status: data.status === "Inativo" ? "Inativo" : "Ativo",
    criado_em: data.criado_em ?? new Date().toISOString(),
  };
}

export function useSupermercados() {
  const [supermercados, setSupermercados] = useState<Supermercado[]>(SUPERMERCADOS);
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    const firestore = db;
    if (!firestore) {
      setSupermercados(SUPERMERCADOS);
      return;
    }

    return onSnapshot(
      collection(firestore, SUPERMERCADOS_COLLECTION),
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeSupermercado(
              snapshotDoc.data() as Partial<Supermercado>,
              snapshotDoc.id
            )
          )
          .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());

        setSupermercados(remote.length > 0 ? remote : SUPERMERCADOS);
      },
      () => {
        setSupermercados(SUPERMERCADOS);
      }
    );
  }, []);

  const createSupermercado = useCallback(
    async (input: { nome: string; codigo: string; endereco: string }) => {
      const novo: Supermercado = {
        id: `sm-${Date.now()}`,
        nome: input.nome.trim(),
        codigo: input.codigo.trim().toUpperCase(),
        endereco: input.endereco.trim(),
        status: "Ativo",
        criado_em: new Date().toISOString(),
      };

      try {
        if (db) {
          await setDoc(doc(db, SUPERMERCADOS_COLLECTION, novo.id), novo);
          return;
        }
      } catch {
        throw new Error("Sem permissão para cadastrar supermercado. Verifique o perfil do usuário.");
      }

      setSupermercados((prev) => [novo, ...prev]);
    },
    []
  );

  const updateSupermercado = useCallback(
    async (
      id: string,
      input: { nome: string; codigo: string; endereco: string }
    ) => {
      try {
        if (db) {
          await updateDoc(doc(db, SUPERMERCADOS_COLLECTION, id), {
            nome: input.nome.trim(),
            codigo: input.codigo.trim().toUpperCase(),
            endereco: input.endereco.trim(),
          });
          return;
        }
      } catch {
        throw new Error("Sem permissão para editar supermercado.");
      }

      setSupermercados((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                nome: input.nome.trim(),
                codigo: input.codigo.trim().toUpperCase(),
                endereco: input.endereco.trim(),
              }
            : item
        )
      );
    },
    []
  );

  const toggleSupermercadoStatus = useCallback(async (id: string) => {
    const supermercadoAtual = supermercados.find((item) => item.id === id);
    if (!supermercadoAtual) return;

    const nextStatus = supermercadoAtual.status === "Ativo" ? "Inativo" : "Ativo";

    try {
      if (db) {
        await updateDoc(doc(db, SUPERMERCADOS_COLLECTION, id), {
          status: nextStatus,
        });
        return;
      }
    } catch {
      throw new Error("Sem permissão para alterar status do supermercado.");
    }

    setSupermercados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item
      )
    );
  }, [supermercados]);

  return {
    supermercados,
    isRemoteSyncEnabled,
    createSupermercado,
    updateSupermercado,
    toggleSupermercadoStatus,
  };
}
