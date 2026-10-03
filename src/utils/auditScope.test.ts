import * as assert from "node:assert/strict";
import { resolveAuditQueryScope } from "./auditScope.ts";

assert.deepEqual(
  resolveAuditQueryScope({ supermercadoId: "unit-1" }),
  { type: "supermercado", id: "unit-1" }
);
assert.deepEqual(
  resolveAuditQueryScope({ empresaId: "company-1", canViewAllUnits: true }),
  { type: "empresa", id: "company-1" }
);
assert.deepEqual(
  resolveAuditQueryScope({ canViewAllCompanies: true, canViewAllUnits: true }),
  { type: "todos" }
);
assert.equal(resolveAuditQueryScope({}), null);

console.log("auditScope tests passed");
