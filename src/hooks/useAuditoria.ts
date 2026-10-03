import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { resolveAuditQueryScope } from "../utils/auditScope";

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
  canViewAllCompanies?: boolean;
  canViewAllUnits?: boolean;
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
    if (!options.canViewAllUnits && supermercadoId !== options.supermercadoId) {
      return false;
    }
  }

  return true;
}

export function useAuditoria(options: UseAuditoriaOptions) {
  const [items, setItems] = useState<AuditoriaItem[]>([]);

  useEffect(() => {
    if (!db) {
      const saved = localStorage.getItem("operador_empilhadeira_auditoria");
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
    const scope = resolveAuditQueryScope(options);

    if (!scope) {
      setItems([]);
      return;
    }

    const scopeFilter =
      scope.type === "supermercado"
        ? where("supermercado_id", "==", scope.id)
        : scope.type === "empresa"
        ? where("empresa_id", "==", scope.id)
        : null;
    const q = scopeFilter
      ? query(auditsRef, scopeFilter, orderBy("occurredAt", "desc"), limit(30))
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
        localStorage.setItem("operador_empilhadeira_auditoria", JSON.stringify(nextItems));
      },
      () => setItems([])
    );

    return () => unsubscribe();
  }, [options.empresaId, options.supermercadoId, options.canViewAllCompanies, options.canViewAllUnits]);

  return items;
}
