import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { actorCanNotify, deliveryOutcome, eventMatchesCurrentCall, stableEventKey } from "../src/index.js";

const env = { FIREBASE_PROJECT_ID: "demo-patio-pro-log", ALLOWED_ORIGIN: "https://app.example.test", FIREBASE_SERVICE_ACCOUNT_JSON: "{}" };

test("only the configured origin can access the push endpoint", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/notify", {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}",
  }), env);
  assert.equal(response.status, 403);
});

test("the notification endpoint requires a Firebase bearer token", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/notify", {
    method: "POST", headers: { origin: env.ALLOWED_ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ auditId: "abcdefghijk1234567890" }),
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Autenticação necessária.");
});

test("unsupported routes and methods do not invoke Firebase APIs", async () => {
  const response = await worker.fetch(new Request("https://worker.example/anything", { method: "GET", headers: { origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(response.status, 404);
});

test("preflight returns the configured origin and allowed headers", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/notify", { method: "OPTIONS", headers: { origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), env.ALLOWED_ORIGIN);
  assert.match(response.headers.get("access-control-allow-headers"), /authorization/i);
});

test("push delivery idempotency key is stable for a lifecycle event and changes on a new transition", async () => {
  const call = { id: "call-1", criado_em: "2026-10-18T10:00:00.000Z", status: "Aguardando" };
  const first = await stableEventKey("chamado_criado", call);
  assert.equal(first, await stableEventKey("chamado_criado", call));
  assert.notEqual(first, await stableEventKey("chamado_criado", { ...call, criado_em: "2026-10-18T10:01:00.000Z" }));
  assert.equal(eventMatchesCurrentCall("chamado_criado", { status: "Aguardando" }, call), true);
  assert.equal(eventMatchesCurrentCall("chamado_finalizado", { statusAtual: "Finalizado" }, call), false);
});

test("authenticated lifecycle events are scoped and sent at most once without real Firebase credentials", async () => {
  const originalFetch = globalThis.fetch;
  const projectId = "demo-patio-pro-log";
  const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwk.kid = "test-key";
  jwk.use = "sig";
  const privateDer = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const privatePem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...privateDer)).match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
  const b64url = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = b64url({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: "actor-1", iat: now, exp: now + 3600 });
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(unsigned)));
  const idToken = `${unsigned}.${btoa(String.fromCharCode(...signature)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const firestoreFields = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
    value === null ? { nullValue: null } : typeof value === "string" ? { stringValue: value } : { booleanValue: value },
  ]));
  const call = { id: "call-1", empresa_id: "company-a", supermercado_id: "store-a", solicitante_uid: "actor-1", criado_em: "2026-10-18T10:00:00.000Z", status: "Aguardando", tipo_servico: "Descarga", setor: "Docas", solicitante_nome: "Solicitante" };
  const audit = { actorUid: "actor-1", action: "chamado_criado", entityType: "chamado", entityId: "call-1", empresa_id: "company-a", supermercado_id: "store-a", details: { empresa_id: "company-a", supermercado_id: "store-a", status: "Aguardando" } };
  const actor = { status: "Ativo", perfil: "Promotor", empresa_id: "company-a", supermercado_id: "store-a" };
  const recipient = { status: "Ativo", perfil: "Operador", empresa_id: "company-a", supermercado_id: "store-a" };
  const deliveryClaims = new Map();
  let fcmSends = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("securetoken@system.gserviceaccount.com")) return Response.json({ keys: [jwk] });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-access-token", expires_in: 3600 });
    if (url.endsWith("/documents:runQuery")) return Response.json([{ document: {
      name: `projects/${projectId}/databases/(default)/documents/usuarios/recipient-1/push_tokens/device-1`,
      fields: firestoreFields({ uid: "recipient-1", empresa_id: "company-a", supermercado_id: "store-a", perfil: "Operador", status: "Ativo", token: "fake-fcm-token" }),
    } }]);
    if (url.includes("/documents/auditoria/audit-event-1")) {
      const fields = firestoreFields({ actorUid: audit.actorUid, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, empresa_id: audit.empresa_id, supermercado_id: audit.supermercado_id });
      fields.details = { mapValue: { fields: firestoreFields(audit.details) } };
      return Response.json({ fields });
    }
    if (url.includes("/documents/chamados/call-1")) return Response.json({ fields: firestoreFields(call) });
    if (url.includes("/documents/usuarios/actor-1")) return Response.json({ fields: firestoreFields(actor) });
    if (url.includes("/documents/usuarios/recipient-1")) return Response.json({ fields: firestoreFields(recipient) });
    if (url.includes("push_delivery_events?documentId=")) {
      const eventKey = new URL(url).searchParams.get("documentId");
      if (deliveryClaims.has(eventKey)) return new Response("already exists", { status: 409 });
      deliveryClaims.set(eventKey, { audit_id: "audit-event-1", state: "claimed" });
      return Response.json({ name: url });
    }
    if (url.includes("/messages:send")) { fcmSends += 1; return Response.json({ name: "projects/demo/messages/1" }); }
    if (url.includes("/push_delivery_events/")) {
      const eventKey = decodeURIComponent(url.split("/push_delivery_events/")[1].split("?")[0]);
      const prior = deliveryClaims.get(eventKey);
      if (!prior) return new Response("not found", { status: 404 });
      if (init.method === "PATCH") {
        const state = JSON.parse(init.body).fields.state.stringValue;
        prior.state = state;
        return Response.json({ name: url });
      }
      return Response.json({ fields: firestoreFields(prior) });
    }
    throw new Error(`Unexpected mocked request: ${url} ${init.method || "GET"}`);
  };

  try {
    const testEnv = { ...env, FIREBASE_PROJECT_ID: projectId, FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "worker@example.test", project_id: projectId, private_key: privatePem }) };
    const makeRequest = () => new Request("https://worker.example/api/notify", {
      method: "POST",
      headers: { origin: testEnv.ALLOWED_ORIGIN, "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ auditId: "audit-event-1" }),
    });
    const firstResponse = await worker.fetch(makeRequest(), testEnv);
    const firstBody = await firstResponse.json();
    assert.equal(firstResponse.status, 200, JSON.stringify(firstBody));
    assert.equal(firstBody.recipientCount, 1);
    const replayResponse = await worker.fetch(makeRequest(), testEnv);
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).duplicate, true);
    assert.equal(fcmSends, 1);
    const [claimedKey] = deliveryClaims.keys();
    deliveryClaims.get(claimedKey).state = "claimed";
    const pendingResponse = await worker.fetch(makeRequest(), testEnv);
    assert.equal(pendingResponse.status, 409, "A claimed delivery must not be acknowledged as sent.");
    assert.equal(fcmSends, 1);
    deliveryClaims.get(claimedKey).state = "sent";
    call.empresa_id = "company-b";
    const crossCompanyResponse = await worker.fetch(makeRequest(), testEnv);
    assert.equal(crossCompanyResponse.status, 403);
    assert.equal(fcmSends, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("tenant authorization distinguishes company admins and unit operators", () => {
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Operador", empresa_id: "a", supermercado_id: "u1" }, "a", "u1"), true);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Operador", empresa_id: "a", supermercado_id: "u1" }, "b", "u1"), false);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Operador", empresa_id: "a", supermercado_id: "u1" }, "a", "u2"), false);
  assert.equal(actorCanNotify({ status: "Inativo", perfil: "Administrador Geral" }, "a", "u1"), false);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Administrador da Empresa", empresa_id: "a", supermercado_id: null }, "a", "u1"), true);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Administrador da Empresa", empresa_id: "a", supermercado_id: null }, "b", "u1"), false);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Administrador da Empresa", empresa_id: "a", supermercado_id: null, supermercado_ids: ["u2"] }, "a", "u1"), false);
  assert.equal(actorCanNotify({ status: "Ativo", perfil: "Administrador da Empresa", empresa_id: "a", supermercado_id: null, supermercado_ids: ["u2"] }, "a", "u2"), true);
});


test("partial FCM delivery is reported as incomplete and never marked sent", () => {
  assert.deepEqual(deliveryOutcome(3, 0), { state: "sent", httpStatus: 200, requiresReview: false });
  assert.deepEqual(deliveryOutcome(3, 1), { state: "partial", httpStatus: 503, requiresReview: true });
  assert.deepEqual(deliveryOutcome(3, 3), { state: "partial", httpStatus: 503, requiresReview: true });
  assert.throws(() => deliveryOutcome(1, 2), /Contagem de entrega inválida/);
  assert.throws(() => deliveryOutcome(-1, 0), /Contagem de entrega inválida/);
});
