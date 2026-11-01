import * as assert from "node:assert/strict";
import { getPermissions } from "./permissions.ts";

const separator = getPermissions("Separador de Televendas");
assert.equal(separator.canAccessOperatorPanel, true);
assert.equal(separator.canManageOperatorQueue, true);
assert.equal(separator.canCreateChamado, true);
assert.equal(separator.canViewUnitQueue, true);
assert.equal(separator.canViewUnitDashboard, false);
assert.equal(separator.canViewHistoryAndReports, false);
assert.equal(separator.canViewAllUnits, false);
assert.equal(separator.canManageUnits, false);
assert.equal(separator.canViewAllCompanies, false);

const operator = getPermissions("Operador");
assert.equal(operator.canAccessOperatorPanel, true);
assert.equal(operator.canViewUnitDashboard, false);

const manager = getPermissions("Gerente da Empresa");
assert.equal(manager.canViewUnitDashboard, true);
assert.equal(manager.canViewAllUnits, false);
assert.equal(manager.canManageUnits, false);
assert.equal(manager.canManageCompanyAdmin, false);

const legacyCompanyAdmin = getPermissions("Administrador da Empresa");
assert.equal(legacyCompanyAdmin.canViewAllUnits, false);
assert.equal(legacyCompanyAdmin.canManageUnits, false);

const platformAdmin = getPermissions("Administrador Geral");
assert.equal(platformAdmin.canViewAllUnits, true);
assert.equal(platformAdmin.canManageUnits, true);

console.log("permissions tests passed");

assert.equal(platformAdmin.canCreateChamado, false);
assert.equal(platformAdmin.canAccessOperatorPanel, false);
assert.equal(platformAdmin.canManageOperatorQueue, false);
assert.equal(platformAdmin.canViewUnitQueue, false);

// Preserve the complete operational access contract for both mobile/web roles.
assert.deepEqual(operator, {
  canCreateChamado: false, canTrackOwnChamados: false,
  canAccessOperatorPanel: true, canManageOperatorQueue: true,
  canViewUnitDashboard: false, canViewUnitQueue: false,
  canViewHistoryAndReports: false, canViewAllUnits: false,
  canManageUnits: false, canViewAllCompanies: false, canManageCompanyAdmin: false,
});
assert.deepEqual(separator, {
  ...operator, canCreateChamado: true, canViewUnitQueue: true,
});
