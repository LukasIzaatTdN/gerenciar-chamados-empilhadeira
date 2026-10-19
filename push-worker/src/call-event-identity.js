/**
 * Event identity contract for Pátio Pro Log push notifications.
 * NOT WIRED TO PRODUCTION: the caller MUST independently load and verify the
 * canonical audit document, actor, call and tenant before using this key.
 * Audit IDs must identify immutable events, never mutable call snapshots.
 */
export const NOTIFIABLE_CALL_ACTIONS = Object.freeze([
  "chamado_criado",
  "chamado_atualizado",
  "chamado_assumido",
  "chamado_iniciado",
  "chamado_finalizado",
]);

const ACTIONS = new Set(NOTIFIABLE_CALL_ACTIONS);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;
const encoder = new TextEncoder();

function requiredId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`Identificador inválido: ${label}.`);
  }
  return value;
}

function canonicalEvent({ action, auditId, companyId, unitId, callId }) {
  if (!ACTIONS.has(action)) throw new Error("Ação de chamado não autorizada.");
  // Every dimension is mandatory: a missing tenant must fail closed.
  return [
    "ppl-call-event-v1",
    requiredId(companyId, "empresa"),
    requiredId(unitId, "unidade"),
    requiredId(callId, "chamado"),
    requiredId(action, "ação"),
    requiredId(auditId, "auditoria"),
  ].join("\n");
}

/**
 * Returns a Firestore-document-safe SHA-256 hex identifier.
 * Same immutable audit event => same key across retries.
 * Different audited updates => distinct keys even on the same call.
 * IMPORTANT: this does not prove an audit is legitimate.
 */
export async function callEventDeliveryKey(event) {
  const bytes = encoder.encode(canonicalEvent(event));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Only a validated, persisted audit ID is a valid event identity.
 * Never derive idempotency from the current call's updated_at/status alone.
 */
export function validateCallEventReference(event) {
  canonicalEvent(event);
  return true;
}
