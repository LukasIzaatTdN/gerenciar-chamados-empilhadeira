// Contract-only module. Not wired into the public Worker route or deployed.
// Secrets must come from a Worker secret binding, never from a client or [vars].
const encoder = new TextEncoder();
export const GATEWAY_VERSION = "ppl-hmac-v1";
export const MAX_SKEW_MS = 5 * 60 * 1000;

function encodeHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function signingInput(timestamp, nonce, payload) {
  return `${GATEWAY_VERSION}\\n${timestamp}\\n${nonce}\\n${payload}`;
}

export async function signGatewayEnvelope({ secret, payload, now = Date.now(), nonce = crypto.randomUUID() }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Segredo HMAC não configurado ou fraco.");
  if (typeof payload !== "string" || payload.length < 2 || payload.length > 4096) throw new Error("Payload inválido.");
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Timestamp inválido.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) throw new Error("Nonce inválido.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput(now, nonce, payload)));
  return { version: GATEWAY_VERSION, timestamp: now, nonce, payload, signature: encodeHex(new Uint8Array(mac)) };
}
