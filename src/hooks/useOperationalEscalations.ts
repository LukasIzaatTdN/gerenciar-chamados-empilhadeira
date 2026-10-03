import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import { db } from "../config/firebase";
import type { OperationalEscalationRecord } from "../services/operationalEscalation";

const STORAGE_KEY = "operador_empilhadeira_operational_escalations";

export function useOperationalEscalations() {
  const [items, setItems] = useState<OperationalEscalationRecord[]>([]);

  useEffect(() => {
    if (!db) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setItems([]);
        return;
      }

      try {
        const parsed = JSON.parse(saved) as OperationalEscalationRecord[];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
      return;
    }

    const ref = collection(db, "operational_escalations");
    const q = query(ref, orderBy("updatedAt", "desc"), limit(20));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextItems = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<OperationalEscalationRecord, "id">),
        }));

        setItems(nextItems);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
      },
      () => setItems([])
    );

    return () => unsubscribe();
  }, []);

  return items;
}
