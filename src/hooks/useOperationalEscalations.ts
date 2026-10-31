import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { db } from "../config/firebase";
import type { OperationalEscalationRecord } from "../services/operationalEscalation";

const STORAGE_KEY = "operador_empilhadeira_operational_escalations";

interface OperationalEscalationScope {
  unitIds?: string[];
  canReadAll?: boolean;
  ownerId?: string | null;
}

export function useOperationalEscalations({ unitIds = [], canReadAll = false, ownerId = null }: OperationalEscalationScope = {}) {
  const [items, setItems] = useState<OperationalEscalationRecord[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      const saved = localStorage.getItem(`${STORAGE_KEY}:${ownerId ?? "guest"}`);
      if (!saved) {
        setItems([]);
        return;
      }

      try {
        const parsed = JSON.parse(saved) as OperationalEscalationRecord[];
        const allowed = new Set(unitIds);
        setItems(Array.isArray(parsed)
          ? parsed.filter((item) => canReadAll || allowed.has(item.unitId))
          : []);
      } catch {
        setItems([]);
      }
      return;
    }

    const ref = collection(db, "operational_escalations");
    const scopes = [...new Set(unitIds.filter(Boolean))];
    if (!canReadAll && scopes.length > 8) {
      setItems([]);
      setSyncError("Escopo de escalonamentos excede o limite de 8 unidades.");
      return;
    }
    if (!canReadAll && scopes.length === 0) {
      setItems([]);
      setSyncError(null);
      return;
    }
    setItems([]);
    setSyncError(null);
    const q = canReadAll
      ? query(ref, orderBy("updatedAt", "desc"), limit(20))
      : scopes.length === 1
        ? query(ref, where("unitId", "==", scopes[0]), orderBy("updatedAt", "desc"), limit(20))
        : query(ref, where("unitId", "in", scopes), orderBy("updatedAt", "desc"), limit(20));
    return onSnapshot(q, (snapshot) => {
      const nextItems = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<OperationalEscalationRecord, "id">),
      }));
      setItems(nextItems);
      localStorage.setItem(`${STORAGE_KEY}:${ownerId ?? "guest"}`, JSON.stringify(nextItems));
    }, (error) => {
      console.warn("[firestore] operational escalations listen failed", {
        operation: "operational_escalations.listen",
        collection: "operational_escalations",
        code: error.code || "unknown",
      });
      setSyncError(`Falha ao sincronizar escalonamentos (${error.code || "unknown"}).`);
      setItems([]);
    });
  }, [canReadAll, ownerId, unitIds.join("|")]);

  return { items, syncError };
}
