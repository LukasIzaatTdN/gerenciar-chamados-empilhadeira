import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserUnitAssignments } from "./userUnitAssignments.ts";

test("legacy unit arrays do not implicitly migrate a user to v2 link documents", () => {
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_id: "unit-a", supermercado_ids: ["unit-a"] }), {
    supermercado_ids: ["unit-a"], vinculos_unidades_v2: false,
  });
  assert.equal(normalizeUserUnitAssignments({ supermercado_ids: ["unit-a"], vinculos_unidades_v2: false }).vinculos_unidades_v2, false);
});

test("explicit v2 remains mandatory and is never downgraded by an empty or absent unit list", () => {
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_id: "unit-a", supermercado_ids: [], vinculos_unidades_v2: true }), {
    supermercado_ids: [], vinculos_unidades_v2: true,
  });
  assert.equal(normalizeUserUnitAssignments({ vinculos_unidades_v2: true }).vinculos_unidades_v2, true);
});

test("normalization preserves declared scope and fails closed for invalid lists", () => {
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_id: "unit-primary" }).supermercado_ids, ["unit-primary"]);
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_id: "unit-primary", supermercado_ids: [] }).supermercado_ids, []);
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_ids: ["unit-a", "unit-a"] }).supermercado_ids, []);
  assert.deepEqual(normalizeUserUnitAssignments({ supermercado_ids: Array.from({ length: 9 }, (_, i) => `unit-${i}`) }).supermercado_ids, []);
  assert.equal(normalizeUserUnitAssignments({ vinculos_unidades_v2: "true" }).vinculos_unidades_v2, false);
});
