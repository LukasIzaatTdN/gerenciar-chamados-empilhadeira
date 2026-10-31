import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { resolveQueryUnitIds } from "../utils/firestoreUnitScope";

export interface AuditoriaItem {
  id: string;
  action: string;
  actorUid?: string;
  actorName: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  occurredAt: string;
  empresa_id?: string;
  supermercado_id?: string;
  metadata?: Record<string, unknown>;
}

interface UseAuditoriaOptions {
  empresaId?: string | null;
  supermercadoId?: string | null;
  supermercadoIds?: string[];
  canViewAllCompanies?: boolean;
  canViewAllUnits?: boolean;
  ownerId?: string | null;
}

function isAuditMatch(item: AuditoriaItem, options: UseAuditoriaOptions) {
  const details = item.details ?? {};

  if (options.canViewAllCompanies && options.canViewAllUnits) {
    return true;
  }

  const empresaId = item.empresa_id ?? details.empresa_id;
  const supermercadoId = item.supermercado_id ?? details.supermercado_id;

  if (options.empresaId && typeof empresaId === "string") {
    if (!options.canViewAllCompanies && empresaId !== options.empresaId) {
      return false;
    }
  }

  if (options.supermercadoId && typeof supermercadoId === "string") {
    if (supermercadoId !== options.supermercadoId) {
      return false;
    }
  }
  if (!options.canViewAllCompanies && !options.supermercadoId) {
    const allowedUnits = resolveQueryUnitIds({
      empresaId: options.empresaId ?? null,
      supermercadoIds: options.supermercadoIds,
      canViewAllCompanies: false,
    });
    if (!allowedUnits?.includes(typeof supermercadoId === "string" ? supermercadoId : "")) return false;
  }

  return true;
}

export function useAuditoria(options: UseAuditoriaOptions) {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      const saved = localStorage.getItem(`operador_empilhadeira_auditoria:${options.ownerId ?? "guest"}`);
      if (!saved) {
        setItems([]);
        return;
      }

      try {
        const parsed = JSON.parse(saved) as AuditoriaItem[];
        setItems((parsed ?? []).filter((item) => isAuditMatch(item, options)).slice(0, 8));
      } catch {
        setItems([]);
      }
      return;
    }

    const auditsRef = collection(db, "auditoria");
    const scopedUnitIds = options.canViewAllCompanies
      ? null
      : resolveQueryUnitIds({
          empresaId: options.empresaId ?? null,
          supermercadoId: options.supermercadoId ?? null,
          supermercadoIds: options.supermercadoIds,
          canViewAllCompanies: false,
        });
    if (!options.canViewAllCompanies && !scopedUnitIds?.length) {
      setItems([]);
      setSyncError(null);
      return;
    }
    setItems([]);
    setSyncError(null);
    const unitFilter = options.canViewAllCompanies && options.supermercadoId
      ? where("supermercado_id", "==", options.supermercadoId)
      : scopedUnitIds?.length
        ? scopedUnitIds.length === 1
          ? where("supermercado_id", "==", scopedUnitIds[0])
          : where("supermercado_id", "in", scopedUnitIds)
        : options.empresaId
          ? where("empresa_id", "==", options.empresaId)
          : null;
    const q = unitFilter
      ? query(auditsRef, unitFilter, orderBy("occurredAt", "desc"), limit(30))
      : query(auditsRef, orderBy("occurredAt", "desc"), limit(30));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextItems = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<AuditoriaItem, "id">),
          }))
          .filter((item) => isAuditMatch(item, options))
          .slice(0, 8);

        setItems(nextItems);
        localStorage.setItem(`operador_empilhadeira_auditoria:${options.ownerId ?? "guest"}`, JSON.stringify(nextItems));
      },
      (error) => {
        console.warn("[firestore] audit listen failed", {
          operation: "auditoria.listen",
          collection: "auditoria",
          code: error.code || "unknown",
        });
        setSyncError(`Falha ao sincronizar auditoria (${error.code || "unknown"}).`);
        setItems([]);
      }
    );

    return () => unsubscribe();
  }, [options.empresaId, options.supermercadoId, options.supermercadoIds?.join("|"), options.canViewAllCompanies, options.canViewAllUnits, options.ownerId]);

  return { items, syncError };
}
