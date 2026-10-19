import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { signGatewayEnvelope, GATEWAY_VERSION, MAX_SKEW_MS } from "../src/gateway-hmac.js";

const secret = randomBytes(48).toString("hex");
const now = 1792380000000;
const nonce = "5c82e5f0-8494-46df-a36d-48d9d7b16d3a";
const payload = JSON.stringify({ auditId: "audit-1", operation: "notify" });
function independentVerify(e, seen, time = now) {
  if (e.version !== GATEWAY_VERSION || !Number.isSafeInteger(e.timestamp) || Math.abs(time - e.timestamp) > MAX_SKEW_MS) return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.nonce)) return false;
  if (typeof e.payload !== "string" || typeof e.signature !== "string" || !/^[0-9a-f]{64}$/.test(e.signature)) return false;
  const expected = createHmac("sha256", secret).update(`${e.version}\n${e.timestamp}\n${e.nonce}\n${e.payload}`, "utf8").digest();
  const received = Buffer.from(e.signature, "hex");
  if (!timingSafeEqual(expected, received)) return false;
  if (seen.has(e.nonce)) return false;
  seen.add(e.nonce);
  return true;
}

test("HMAC contract interoperates with independent Node verifier", async () => {
  const envelope = await signGatewayEnvelope({ secret, payload, now, nonce });
  assert.equal(envelope.signature.length, 64);
  assert.equal(independentVerify(envelope, new Set()), true);
});

test("HMAC rejects tampering of body, nonce, timestamp, and signature", async () => {
  const e = await signGatewayEnvelope({ secret, payload, now, nonce });
  for (const tampered of [
    { ...e, payload: JSON.stringify({ auditId: "other", operation: "notify" }) },
    { ...e, nonce: "7c82e5f0-8494-46df-a36d-48d9d7b16d3a" },
    { ...e, timestamp: now + 1000 },
    { ...e, signature: "0".repeat(64) },
  ]) assert.equal(independentVerify(tampered, new Set()), false);
});

test("HMAC replay claim rejects repeated valid envelope", async () => {
  const e = await signGatewayEnvelope({ secret, payload, now, nonce });
  const seen = new Set();
  assert.equal(independentVerify(e, seen), true);
  assert.equal(independentVerify(e, seen), false);
});

test("HMAC rejects stale/future requests and missing weak secrets", async () => {
  const e = await signGatewayEnvelope({ secret, payload, now, nonce });
  assert.equal(independentVerify(e, new Set(), now + MAX_SKEW_MS + 1), false);
  assert.equal(independentVerify(e, new Set(), now - MAX_SKEW_MS - 1), false);
  await assert.rejects(signGatewayEnvelope({ secret: "weak", payload, now, nonce }), /Segredo/);
  await assert.rejects(signGatewayEnvelope({ secret, payload, now, nonce: "user-supplied" }), /Nonce/);
});
