import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Empresa, EmpresaStatus, PlanoCiclo, PlanoStatus } from "../types/empresa";
import { resolveEmpresaId, sanitizeTenantId } from "../utils/tenant";
import { EMPRESAS } from "../data/empresas";

const EMPRESAS_COLLECTION = "empresas";
const EMPRESAS_CACHE_KEY = "empresas_cache_v1";

function normalizeEmpresa(data: Partial<Empresa>, fallbackId: string): Empresa {
  const planoCodigo = data.plano_codigo?.trim().toLowerCase() || "starter";

  return {
    id: resolveEmpresaId(data.id ?? fallbackId, fallbackId),
    nome: data.nome?.trim() || "Empresa sem nome",
    codigo: data.codigo?.trim().toUpperCase() || "EMP",
    cnpj: typeof data.cnpj === "string" && data.cnpj.trim() ? data.cnpj.trim() : null,
    status: data.status === "Inativa" ? "Inativa" : "Ativa",
    plano_codigo: planoCodigo,
    plano_nome: data.plano_nome?.trim() || `Plano ${planoCodigo}`,
    plano_status:
      data.plano_status === "Suspenso" ||
      data.plano_status === "Cancelado" ||
      data.plano_status === "Teste"
        ? data.plano_status
        : "Ativo",
    plano_ciclo:
      data.plano_ciclo === "Trimestral" ||
      data.plano_ciclo === "Semestral" ||
      data.plano_ciclo === "Anual"
        ? data.plano_ciclo
        : "Mensal",
    max_usuarios:
      typeof data.max_usuarios === "number" && Number.isFinite(data.max_usuarios)
        ? data.max_usuarios
        : null,
    max_unidades:
      typeof data.max_unidades === "number" && Number.isFinite(data.max_unidades)
        ? data.max_unidades
        : null,
    contrato_inicio:
      typeof data.contrato_inicio === "string" && data.contrato_inicio.trim()
        ? data.contrato_inicio
        : null,
    contrato_fim:
      typeof data.contrato_fim === "string" && data.contrato_fim.trim()
        ? data.contrato_fim
        : null,
    criado_em: data.criado_em ?? new Date().toISOString(),
  };
}

function buildEmpresaId(codigo: string) {
  return `emp-${sanitizeTenantId(codigo)}`;
}

export function useEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>(() => {
    if (typeof window === "undefined") return EMPRESAS;

    try {
      const raw = window.sessionStorage.getItem(EMPRESAS_CACHE_KEY);
      if (!raw) return EMPRESAS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return EMPRESAS;
      return parsed
        .map((item, index) =>
          normalizeEmpresa(item as Partial<Empresa>, EMPRESAS[index]?.id ?? `empresa-${index}`)
        )
        .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    } catch {
      return EMPRESAS;
    }
  });
  const [retryTick, setRetryTick] = useState(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const isRemoteSyncEnabled = db !== null;

  useEffect(() => {
    if (!db) {
      setEmpresas(EMPRESAS);
      return;
    }

    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    return onSnapshot(
      collection(db, EMPRESAS_COLLECTION),
      (snapshot) => {
        const remote = snapshot.docs
          .map((item) => normalizeEmpresa(item.data() as Partial<Empresa>, item.id))
          .sort(
            (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
          );

        setEmpresas(remote);

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(EMPRESAS_CACHE_KEY, JSON.stringify(remote));
          } catch {
            // Ignore storage errors to avoid breaking render flow.
          }
        }
      },
      () => {
        // Keep current cache and retry listener soon to avoid "empty until reload" behavior.
        if (retryTimeoutRef.current !== null) return;
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          setRetryTick((value) => value + 1);
        }, 1500);
      }
    );
  }, [retryTick]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const createEmpresa = useCallback(
    async (input: {
      nome: string;
      codigo: string;
      cnpj?: string;
      plano_codigo: string;
      plano_nome: string;
      plano_status: PlanoStatus;
      plano_ciclo: PlanoCiclo;
      max_usuarios?: number | null;
      max_unidades?: number | null;
      contrato_inicio?: string | null;
      contrato_fim?: string | null;
    }) => {
      const codigo = input.codigo.trim().toUpperCase();
      const empresa: Empresa = {
        id: buildEmpresaId(codigo),
        nome: input.nome.trim(),
        codigo,
        cnpj: input.cnpj?.trim() ? input.cnpj.trim() : null,
        status: "Ativa",
        plano_codigo: input.plano_codigo.trim().toLowerCase(),
        plano_nome: input.plano_nome.trim() || `Plano ${input.plano_codigo.trim().toLowerCase()}`,
        plano_status: input.plano_status,
        plano_ciclo: input.plano_ciclo,
        max_usuarios: input.max_usuarios ?? null,
        max_unidades: input.max_unidades ?? null,
        contrato_inicio: input.contrato_inicio?.trim() ? input.contrato_inicio : null,
        contrato_fim: input.contrato_fim?.trim() ? input.contrato_fim : null,
        criado_em: new Date().toISOString(),
      };

      if (db) {
        await setDoc(doc(db, EMPRESAS_COLLECTION, empresa.id), empresa);
        return;
      }

      setEmpresas((prev) => [empresa, ...prev]);
    },
    []
  );

  const updateEmpresa = useCallback(
    async (
      id: string,
      input: {
        nome: string;
        codigo: string;
        cnpj?: string;
        plano_codigo: string;
        plano_nome: string;
        plano_status: PlanoStatus;
        plano_ciclo: PlanoCiclo;
        max_usuarios?: number | null;
        max_unidades?: number | null;
        contrato_inicio?: string | null;
        contrato_fim?: string | null;
      }
    ) => {
      const payload = {
        nome: input.nome.trim(),
        codigo: input.codigo.trim().toUpperCase(),
        cnpj: input.cnpj?.trim() ? input.cnpj.trim() : null,
        plano_codigo: input.plano_codigo.trim().toLowerCase(),
        plano_nome: input.plano_nome.trim() || `Plano ${input.plano_codigo.trim().toLowerCase()}`,
        plano_status: input.plano_status,
        plano_ciclo: input.plano_ciclo,
        max_usuarios: input.max_usuarios ?? null,
        max_unidades: input.max_unidades ?? null,
        contrato_inicio: input.contrato_inicio?.trim() ? input.contrato_inicio : null,
        contrato_fim: input.contrato_fim?.trim() ? input.contrato_fim : null,
      };

      if (db) {
        await updateDoc(doc(db, EMPRESAS_COLLECTION, id), payload);
        return;
      }

      setEmpresas((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
    },
    []
  );

  const toggleEmpresaStatus = useCallback(
    async (id: string) => {
      const current = empresas.find((item) => item.id === id);
      if (!current) return;
      const status: EmpresaStatus = current.status === "Ativa" ? "Inativa" : "Ativa";

      if (db) {
        await updateDoc(doc(db, EMPRESAS_COLLECTION, id), { status });
        return;
      }

      setEmpresas((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    },
    [empresas]
  );

  return {
    empresas,
    isRemoteSyncEnabled,
    createEmpresa,
    updateEmpresa,
    toggleEmpresaStatus,
  };
}
