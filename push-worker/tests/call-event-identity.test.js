import test from "node:test";
import assert from "node:assert/strict";
import { callEventDeliveryKey, NOTIFIABLE_CALL_ACTIONS, validateCallEventReference } from "../src/call-event-identity.js";

const base = {
  action: "chamado_atualizado",
  auditId: "audit-001",
  companyId: "empresa-A",
  unitId: "unidade-01",
  callId: "chamado-125",
};

test("event identity supports creation, update, assignment, start and completion", async () => {
  assert.deepEqual([...NOTIFIABLE_CALL_ACTIONS], [
    "chamado_criado", "chamado_atualizado", "chamado_assumido", "chamado_iniciado", "chamado_finalizado",
  ]);
  const keys = await Promise.all(NOTIFIABLE_CALL_ACTIONS.map(action => callEventDeliveryKey({ ...base, action })));
  assert.equal(new Set(keys).size, 5);
  for (const key of keys) assert.match(key, /^[a-f0-9]{64}$/);
});

test("same audited event yields identical delivery key across retries", async () => {
  const first = await callEventDeliveryKey(base);
  assert.equal(first, await callEventDeliveryKey({ ...base }));
  assert.equal(validateCallEventReference(base), true);
});

test("distinct updates of same call have distinct event keys", async () => {
  const a = await callEventDeliveryKey(base);
  const b = await callEventDeliveryKey({ ...base, auditId: "audit-002" });
  assert.notEqual(a, b);
});

test("event identity is scoped to company, unit and call", async () => {
  const original = await callEventDeliveryKey(base);
  for (const variant of [
    { companyId: "empresa-B" }, { unitId: "unidade-02" }, { callId: "chamado-126" },
  ]) assert.notEqual(original, await callEventDeliveryKey({ ...base, ...variant }));
});

test("event identity rejects unsupported actions and missing tenant dimensions", async () => {
  for (const variant of [
    { action: "usuario_criado" }, { action: "chamado_excluido" },
    { auditId: "" }, { companyId: "" }, { unitId: null }, { callId: "../outside" },
    { companyId: "empresa/A" }, { auditId: "x".repeat(151) },
  ]) await assert.rejects(callEventDeliveryKey({ ...base, ...variant }), /inválid|autorizada/i);
});

test("event identity rejects absent audit record identity rather than guessing from timestamp", async () => {
  await assert.rejects(callEventDeliveryKey({ ...base, auditId: undefined, updatedAt: "2026-10-19T10:00:00Z" }), /auditoria/i);
});
