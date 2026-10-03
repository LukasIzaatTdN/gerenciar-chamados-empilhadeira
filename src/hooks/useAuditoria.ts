import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";

export interface AuditoriaItem {
  id: string;
  action: string;
  actorName: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  occurredAt: string;
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

  if (options.empresaId && typeof details.empresa_id === "string") {
    if (!options.canViewAllCompanies && details.empresa_id !== options.empresaId) {
      return false;
    }
  }

  if (options.supermercadoId && typeof details.supermercado_id === "string") {
    if (!options.canViewAllUnits && details.supermercado_id !== options.supermercadoId) {
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
    const q = query(auditsRef, orderBy("occurredAt", "desc"), limit(30));

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
