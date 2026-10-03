import * as assert from "node:assert/strict";
import { assertBusinessScope, assertUserAccess, createAuditEntry } from "./businessRules.ts";

const validScope = {
  canViewAllCompanies: false,
  canViewAllUnits: false,
  currentCompanyId: "empresa-1",
  currentSupermercadoId: "unidade-1",
  targetCompanyId: "empresa-1",
  targetSupermercadoId: "unidade-1",
  entityName: "chamado",
};

assert.doesNotThrow(() => assertBusinessScope(validScope));

assert.throws(
  () =>
    assertBusinessScope({
      ...validScope,
      targetSupermercadoId: "unidade-2",
    }),
  /unidade/
);

const audit = createAuditEntry({
  action: "chamado_criado",
  actorUid: "user-1",
  actorName: "Maria",
  entityType: "chamado",
  entityId: "c-1",
  details: { empresa_id: "empresa-1", supermercado_id: "unidade-1" },
});

assert.equal(audit.action, "chamado_criado");
assert.equal(audit.actorName, "Maria");
assert.equal(audit.entityType, "chamado");
assert.equal(audit.entityId, "c-1");
assert.equal(audit.actorUid, "user-1");
assert.equal(audit.empresa_id, "empresa-1");
assert.equal(audit.supermercado_id, "unidade-1");
assert.ok(typeof audit.occurredAt === "string" && audit.occurredAt.length > 0);
assert.equal(Object.prototype.hasOwnProperty.call(audit, "metadata"), false);

const auditWithMetadata = createAuditEntry({
  action: "chamado_atualizado",
  actorUid: "user-1",
  actorName: "Maria",
  entityType: "chamado",
  entityId: "c-1",
  details: { empresa_id: "empresa-1", supermercado_id: "unidade-1" },
  metadata: { source: "test" },
});
assert.deepEqual(auditWithMetadata.metadata, { source: "test" });

assert.doesNotThrow(() =>
  assertUserAccess({
    isAuthenticated: true,
    userId: "user-1",
    perfil: "Administrador Geral",
    requiredAction: "manage_empresa",
  })
);

assert.doesNotThrow(() =>
  assertUserAccess({
    isAuthenticated: true,
    userId: "user-1",
    perfil: "Administrador da Empresa",
    requiredAction: "manage_usuario",
  })
);

assert.throws(
  () =>
    assertUserAccess({
      isAuthenticated: false,
      userId: null,
      requiredAction: "create_chamado",
    }),
  /Sessão expirada/
);

assert.throws(
  () =>
    assertUserAccess({
      isAuthenticated: true,
      userId: "user-1",
      requiredAction: "create_chamado",
    }),
  /autorização/
);

assert.throws(
  () =>
    assertUserAccess({
      isAuthenticated: true,
      userId: "user-1",
      perfil: "Promotor",
      requiredAction: "manage_users",
    }),
  /autorização/
);

console.log("businessRules tests passed");
