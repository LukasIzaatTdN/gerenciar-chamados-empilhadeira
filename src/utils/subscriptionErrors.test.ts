import assert from "node:assert/strict";
import { explainSubscriptionError } from "./subscriptionErrors.ts";

assert.match(explainSubscriptionError({ code: "functions/not-found", message: "not found" }), /manageSubscription não foi encontrada em us-central1/);
assert.match(explainSubscriptionError({ code: "functions/internal", message: "internal" }), /Consulte os logs da função/);
assert.match(explainSubscriptionError({ code: "functions/permission-denied", message: "permission denied" }), /Administrador Geral ativo/);
assert.match(explainSubscriptionError({ code: "permission-denied", message: "permission denied" }), /regras SaaS/);
assert.match(explainSubscriptionError({}), /console do navegador/);

console.log("subscription error mapping tests passed");
