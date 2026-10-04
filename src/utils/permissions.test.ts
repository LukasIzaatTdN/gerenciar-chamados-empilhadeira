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

const supervisor = getPermissions("Supervisor");
assert.equal(supervisor.canAccessOperatorPanel, true);
assert.equal(supervisor.canViewUnitDashboard, true);
assert.equal(supervisor.canViewHistoryAndReports, true);

const companyAdmin = getPermissions("Administrador da Empresa");
assert.equal(companyAdmin.canViewAllUnits, true);
assert.equal(companyAdmin.canManageUnits, true);

const platformAdmin = getPermissions("Administrador Geral");
assert.equal(platformAdmin.canViewAllUnits, true);
assert.equal(platformAdmin.canManageUnits, false);

console.log("permissions tests passed");
