import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHmac, webcrypto } from "node:crypto";
import { signGatewayEnvelope } from "../src/gateway-hmac.js";

const source = readFileSync(new URL("../../apps-script-fcm/gateway-nonce-claim.gs", import.meta.url), "utf8");
const verifierSource = readFileSync(new URL("../../apps-script-fcm/gateway-verifier.gs", import.meta.url), "utf8");
const nonce = "5c82e5f0-8494-46df-a36d-48d9d7b16d3a";
const timestamp = 1792380000000;
function runtime(fetchImpl, secret = "s".repeat(48)) {
  const ctx = {
    UrlFetchApp: { fetch: fetchImpl },
    ScriptApp: { getOAuthToken: () => "fake-oauth-token" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      computeHmacSha256Signature: (message, key) => [...createHmac("sha256", key).update(message, "utf8").digest()].map(b => b > 127 ? b - 256 : b),
    },
    Date, JSON, Number, Error, RegExp, Math, encodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(source + "\n" + verifierSource, ctx);
  return ctx;
}

test("Apps Script Firestore claim creates nonce once, then rejects duplicate", () => {
  const docs = new Set();
  let count = 0;
  const ctx = runtime((url, options) => {
    count++;
    assert.match(url, /push_gateway_nonces\?documentId=/);
    assert.equal(options.method, "post");
    assert.equal(options.muteHttpExceptions, true);
    assert.equal(options.headers.Authorization, "Bearer fake-oauth-token");
    const id = new URL(url).searchParams.get("documentId");
    assert.equal(id, nonce);
    if (docs.has(id)) return { getResponseCode: () => 409 };
    docs.add(id);
    return { getResponseCode: () => 201 };
  });
  assert.equal(ctx.claimGatewayNonceFirestore_(nonce, timestamp), true);
  assert.equal(ctx.claimGatewayNonceFirestore_(nonce, timestamp), false);
  assert.equal(count, 2);
});

test("Apps Script nonce claim fails closed for unauthorized and uncertain responses", () => {
  for (const code of [400, 401, 403, 429, 500, 503]) {
    const ctx = runtime(() => ({ getResponseCode: () => code }));
    assert.throws(() => ctx.claimGatewayNonceFirestore_(nonce, timestamp), /Replay claim failed/);
  }
  const ctx = runtime(() => { throw Error("network timeout"); });
  assert.throws(() => ctx.claimGatewayNonceFirestore_(nonce, timestamp), /network timeout/);
});

test("Apps Script rejects invalid nonce before any Firestore request", () => {
  let called = 0;
  const ctx = runtime(() => { called++; throw Error("should not call"); });
  for (const invalid of ["x", "__reserved__", "5c82e5f0-8494-16df-a36d-48d9d7b16d3a", null]) {
    assert.throws(() => ctx.claimGatewayNonceFirestore_(invalid, timestamp), /Invalid nonce/);
  }
  assert.throws(() => ctx.claimGatewayNonceFirestore_(nonce, -1), /Invalid nonce/);
  assert.equal(called, 0);
});

test("Signed Worker envelope is verified by Apps Script and consumed once", async () => {
  const secret = "A".repeat(48);
  const seen = new Set();
  const ctx = runtime((url) => {
    const id = new URL(url).searchParams.get("documentId");
    if (seen.has(id)) return { getResponseCode: () => 409 };
    seen.add(id);
    return { getResponseCode: () => 201 };
  }, secret);
  const envelope = await signGatewayEnvelope({ secret, payload: JSON.stringify({ auditId: "a1", operation: "notify" }), now: timestamp, nonce });
  const claim = ctx.claimGatewayNonceFirestore_;
  assert.equal(ctx.verifyGatewayEnvelope_(envelope, claim, timestamp).auditId, "a1");
  assert.throws(() => ctx.verifyGatewayEnvelope_(envelope, claim, timestamp), /repetida/);
  assert.throws(() => ctx.verifyGatewayEnvelope_({ ...envelope, payload: '{"auditId":"other"}' }, claim, timestamp), /Assinatura inválida/);
  assert.throws(() => ctx.verifyGatewayEnvelope_(envelope, claim, timestamp + 300001), /Timestamp/);
});
