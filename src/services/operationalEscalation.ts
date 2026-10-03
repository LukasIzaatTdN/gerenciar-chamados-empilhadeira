import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import {
  getOperationalEscalationTransitions,
  type OperationalEscalationSummary,
} from "../utils/operationalEscalation";

export const OPERATIONAL_ESCALATIONS_COLLECTION = "operational_escalations";

export type OperationalEscalationStatus = "active" | "resolved";

export interface OperationalEscalationRecord {
  id: string;
  unitId: string;
  unitName: string;
  status: OperationalEscalationStatus;
  severity: OperationalEscalationSummary["severity"];
  openCalls: number;
  urgentCalls: number;
  delayedCalls: number;
  action: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export async function syncOperationalEscalationState(
  summaries: OperationalEscalationSummary[],
  previousCriticalUnitIds: ReadonlySet<string>
): Promise<{ created: OperationalEscalationRecord[]; resolved: string[] }> {
  if (!db) {
    return { created: [], resolved: [] };
  }

  const { newCritical, resolved } = getOperationalEscalationTransitions(
    summaries,
    previousCriticalUnitIds
  );

  const created: OperationalEscalationRecord[] = [];
  const escalationsRef = collection(db, OPERATIONAL_ESCALATIONS_COLLECTION);

  for (const summary of newCritical) {
    const activeQuery = query(
      escalationsRef,
      where("unitId", "==", summary.unitId),
      where("status", "==", "active"),
      limit(1)
    );

    const existingSnapshot = await getDocs(activeQuery);
    const timestamp = new Date().toISOString();
    const payload: Omit<OperationalEscalationRecord, "id"> = {
      unitId: summary.unitId,
      unitName: summary.unitName,
      status: "active",
      severity: summary.severity,
      openCalls: summary.openCalls,
      urgentCalls: summary.urgentCalls,
      delayedCalls: summary.delayedCalls,
      action: summary.action,
      createdAt: existingSnapshot.empty ? timestamp : existingSnapshot.docs[0].data().createdAt ?? timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    };

    if (existingSnapshot.empty) {
      const docRef = await addDoc(escalationsRef, payload);
      created.push({ id: docRef.id, ...payload });
      continue;
    }

    const [docSnapshot] = existingSnapshot.docs;
    await updateDoc(docSnapshot.ref, {
      ...payload,
      status: "active",
      resolvedAt: null,
    });
    created.push({ id: docSnapshot.id, ...payload });
  }

  for (const unitId of resolved) {
    const activeQuery = query(
      escalationsRef,
      where("unitId", "==", unitId),
      where("status", "==", "active")
    );

    const activeSnapshot = await getDocs(activeQuery);
    const timestamp = new Date().toISOString();

    await Promise.all(
      activeSnapshot.docs.map((docSnapshot) =>
        updateDoc(docSnapshot.ref, {
          status: "resolved",
          resolvedAt: timestamp,
          updatedAt: timestamp,
        })
      )
    );
  }

  return { created, resolved };
}
