import assert from "node:assert/strict";
import test from "node:test";
import { matchesFirestoreUnitScope, resolveQueryUnitIds } from "./firestoreUnitScope.ts";
import { resolveAuthorizedUnitIds } from "./tenant.ts";

test("authorized unit resolution prefers an explicit list and keeps legacy primary fallback", () => {
  assert.deepEqual(resolveAuthorizedUnitIds("unit-primary", ["unit-a", "unit-b"]), ["unit-a", "unit-b"]);
  assert.deepEqual(resolveAuthorizedUnitIds("unit-primary", []), []);
  assert.deepEqual(resolveAuthorizedUnitIds("unit-primary", undefined), ["unit-primary"]);
  assert.deepEqual(resolveAuthorizedUnitIds("unit-primary", ["unit-a", "unit-a"]), []);
  assert.deepEqual(resolveAuthorizedUnitIds("unit-primary", Array.from({ length: 9 }, (_, i) => `u${i}`)), []);
});

test("scoped query resolver supports one, two and eight units and fails closed", () => {
  const units = Array.from({ length: 8 }, (_, index) => `unit-${index + 1}`);
  assert.deepEqual(resolveQueryUnitIds({ empresaId: "company", supermercadoIds: [units[0]], canViewAllCompanies: false }), [units[0]]);
  assert.deepEqual(resolveQueryUnitIds({ empresaId: "company", supermercadoIds: units.slice(0, 2), canViewAllCompanies: false }), units.slice(0, 2));
  assert.deepEqual(resolveQueryUnitIds({ empresaId: "company", supermercadoIds: units, canViewAllCompanies: false }), units);
  assert.deepEqual(resolveQueryUnitIds({ empresaId: "company", supermercadoIds: units.slice(0, 2), supermercadoId: "unit-x", canViewAllCompanies: false }), []);
  assert.deepEqual(resolveQueryUnitIds({ empresaId: null, supermercadoIds: [], canViewAllCompanies: false }), []);
});

test("unit scope matching keeps company and unit boundaries", () => {
  const scope = { empresaId: "company-a", supermercadoIds: ["unit-a", "unit-b"], canViewAllCompanies: false };
  assert.equal(matchesFirestoreUnitScope(scope, "company-a", "unit-b"), true);
  assert.equal(matchesFirestoreUnitScope(scope, "company-a", "unit-c"), false);
  assert.equal(matchesFirestoreUnitScope(scope, "company-b", "unit-a"), false);
  assert.equal(matchesFirestoreUnitScope({ empresaId: null, supermercadoIds: [], canViewAllCompanies: true }, "company-a", "unit-a"), true);
});

