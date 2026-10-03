import test from "node:test";
import assert from "node:assert/strict";

import {
  getNewCriticalEscalations,
  getOperationalEscalationTransitions,
  type OperationalEscalationSummary,
} from "./operationalEscalation.ts";

const summary: OperationalEscalationSummary[] = [
  {
    unitId: "unit-critical-new",
    unitName: "Unidade nova crítica",
    openCalls: 3,
    urgentCalls: 1,
    delayedCalls: 2,
    severity: "critical",
    action: "Escalonar supervisão.",
  },
  {
    unitId: "unit-critical-existing",
    unitName: "Unidade já crítica",
    openCalls: 2,
    urgentCalls: 1,
    delayedCalls: 1,
    severity: "critical",
    action: "Escalonar supervisão.",
  },
  {
    unitId: "unit-medium",
    unitName: "Unidade em atenção",
    openCalls: 2,
    urgentCalls: 1,
    delayedCalls: 0,
    severity: "medium",
    action: "Revisar fila.",
  },
];

test("getNewCriticalEscalations returns only newly critical units", () => {
  const result = getNewCriticalEscalations(summary, new Set(["unit-critical-existing"]));

  assert.deepEqual(result.map((item) => item.unitId), ["unit-critical-new"]);
});

test("getOperationalEscalationTransitions tracks new critical and resolved units", () => {
  const result = getOperationalEscalationTransitions(
    summary.filter((item) => item.unitId !== "unit-critical-existing"),
    new Set(["unit-critical-existing"])
  );

  assert.deepEqual(result.newCritical.map((item) => item.unitId), ["unit-critical-new"]);
  assert.deepEqual(result.resolved, ["unit-critical-existing"]);
});