import test from "node:test";
import assert from "node:assert/strict";

import { resolveNotificationRecipients } from "./whatsapp.ts";

test("resolveNotificationRecipients routes operational escalation to configured supervisors", () => {
  const result = resolveNotificationRecipients("operational_escalation", {
    unitId: "unit-1",
    phase: "critical",
  });

  assert.deepEqual(result, ["+5511999999999"]);
});

test("resolveNotificationRecipients prefers explicit phone first", () => {
  const result = resolveNotificationRecipients("chamado_assumido", {
    solicitantePhone: "+5511888888888",
    operadorPhone: "+5511777777777",
  });

  assert.deepEqual(result, ["+5511888888888"]);
});

test("resolveNotificationRecipients routes critical operational alerts to the unit supervisor phone", () => {
  const result = resolveNotificationRecipients("operational_escalation", {
    unitId: "unit-1",
    supervisorPhones: "+5511999999999, +5511888888888",
  });

  assert.deepEqual(result, ["+5511999999999", "+5511888888888"]);
});
