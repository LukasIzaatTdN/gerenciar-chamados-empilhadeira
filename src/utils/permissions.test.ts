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
