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
import type { Supermercado } from "../types/supermercado";
import { resolveEmpresaId } from "../utils/tenant";

const SUPERMERCADOS_COLLECTION = "supermercados";

interface UseSupermercadosOptions {
  empresaId?: string | null;
  canViewAllCompanies?: boolean;
}

function normalizeIdFromCodigo(codigo: string) {
  return `sm-${codigo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")}`;
}

function normalizeSupermercado(
  data: Partial<Supermercado>,
  fallbackId: string
): Supermercado {
  return {
    id: data.id ?? fallbackId,
    empresa_id: resolveEmpresaId(data.empresa_id),
    nome: data.nome ?? "Unidade sem nome",
    codigo: data.codigo ?? "UND",
    endereco: data.endereco ?? "Endereço não informado",
    status: data.status === "Inativo" ? "Inativo" : "Ativo",
    criado_em: data.criado_em ?? new Date().toISOString(),
  };
}

export function useSupermercados(options: UseSupermercadosOptions = {}) {
  const { empresaId = null, canViewAllCompanies = false } = options;
  const [supermercados, setSupermercados] = useState<Supermercado[]>([]);
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    const firestore = db;
    if (!firestore) {
      setSupermercados([]);
      return;
    }

    if (!canViewAllCompanies && !empresaId) {
      setSupermercados([]);
      return;
    }

    const supermercadosQuery =
      canViewAllCompanies || !empresaId
        ? collection(firestore, SUPERMERCADOS_COLLECTION)
        : query(
            collection(firestore, SUPERMERCADOS_COLLECTION),
            where("empresa_id", "==", empresaId)
          );

    return onSnapshot(
      supermercadosQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeSupermercado(
              snapshotDoc.data() as Partial<Supermercado>,
              snapshotDoc.id
            )
          )
          .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());

        setSupermercados(remote);
      },
      () => {
        setSupermercados([]);
      }
    );
  }, [canViewAllCompanies, empresaId]);

  const createSupermercado = useCallback(
    async (input: {
      empresa_id: string;
      nome: string;
      codigo: string;
      endereco: string;
    }) => {
      const codigoNormalizado = input.codigo.trim().toUpperCase();
      const novo: Supermercado = {
        id: normalizeIdFromCodigo(codigoNormalizado),
        empresa_id: resolveEmpresaId(input.empresa_id),
        nome: input.nome.trim(),
        codigo: codigoNormalizado,
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
      input: { empresa_id: string; nome: string; codigo: string; endereco: string }
    ) => {
      try {
        if (db) {
          await updateDoc(doc(db, SUPERMERCADOS_COLLECTION, id), {
            empresa_id: resolveEmpresaId(input.empresa_id),
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
                empresa_id: resolveEmpresaId(input.empresa_id),
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
