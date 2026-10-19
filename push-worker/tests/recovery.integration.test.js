import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { recipientIdentityKey } from "../src/index.js";

test("recovery: concurrent requests, failed persistence, and cross-tenant denial", async () => {
  const originalFetch = globalThis.fetch;
  const projectId = "demo-patio-pro-log";
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign","verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "integration-key";
  const pemBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const privatePem = "-----BEGIN PRIVATE KEY-----\n" + btoa(String.fromCharCode(...pemBytes)).match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----";
  const encode = (v) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v)))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const now = Math.floor(Date.now()/1000);
  const unsigned = encode({alg:"RS256",kid:"integration-key",typ:"JWT"})+"."+encode({aud:projectId,iss:"https://securetoken.google.com/"+projectId,sub:"actor-1",iat:now,exp:now+3600});
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(unsigned)));
  const jwt = unsigned+"."+btoa(String.fromCharCode(...sig)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const env = {FIREBASE_PROJECT_ID:projectId,ALLOWED_ORIGIN:"https://app.example.test",FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:"test@example.test",project_id:projectId,private_key:privatePem})};
  const encodeValue = (v) => v === null ? {nullValue:null} : typeof v === "number" ? {integerValue:String(v)} : typeof v === "string" ? {stringValue:v} : typeof v === "boolean" ? {booleanValue:v} : {mapValue:{fields:encodeFields(v)}};
  const encodeFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,encodeValue(v)]));
  const call = {id:"call-1",empresa_id:"company-a",supermercado_id:"store-a",solicitante_uid:"actor-1",criado_em:"2026-10-18T10:00:00Z",status:"Aguardando",tipo_servico:"Descarga"};
  const audit = {actorUid:"actor-1",action:"chamado_criado",entityType:"chamado",entityId:"call-1",empresa_id:"company-a",supermercado_id:"store-a",details:{empresa_id:"company-a",supermercado_id:"store-a",status:"Aguardando"}};
  const actor = {status:"Ativo",perfil:"Promotor",empresa_id:"company-a",supermercado_id:"store-a"};
  const operator = {status:"Ativo",perfil:"Operador",empresa_id:"company-a",supermercado_id:"store-a"};
  const token = {uid:"operator-1",empresa_id:"company-a",supermercado_id:"store-a",perfil:"Operador",status:"Ativo",token:"test-device-token"};
  const key = await recipientIdentityKey({uid:token.uid,token:token.token});
  const events = new Map();
  const attempts = new Map();
  let sends = 0;
  let failAttemptPatch = false;
  let tenantToken = false;
  const response = (obj) => Response.json({fields:encodeFields(obj)});
  globalThis.fetch = async (input, init={}) => {
    const url = String(input);
    if (url.includes("securetoken@system.gserviceaccount.com")) return Response.json({keys:[jwk]});
    if (url === "https://oauth2.googleapis.com/token") return Response.json({access_token:"fake-access-token",expires_in:3600});
    if (url.endsWith("/documents:runQuery")) return Response.json([{document:{name:"projects/"+projectId+"/databases/(default)/documents/usuarios/operator-1/push_tokens/device-1",fields:encodeFields(tenantToken ? {...token,empresa_id:"company-b"} : token)}}]);
    if (url.includes("/documents/auditoria/audit-event-1")) return response(audit);
    if (url.includes("/documents/chamados/call-1")) return response(call);
    if (url.includes("/documents/usuarios/actor-1")) return response(actor);
    if (url.includes("/documents/usuarios/operator-1")) return response(operator);
    if (url.includes("push_delivery_events?documentId=")) {
      const id = new URL(url).searchParams.get("documentId");
      if (events.has(id)) return new Response("exists",{status:409});
      events.set(id,{audit_id:"audit-event-1",state:"claimed"});
      return Response.json({name:id});
    }
    if (url.includes("/push_delivery_events/")) {
      const id = url.split("/push_delivery_events/")[1].split("?")[0];
      if (!events.has(id)) return new Response("missing",{status:404});
      const doc = events.get(id);
      if (init.method === "PATCH") {
        const fields = JSON.parse(init.body).fields;
        doc.state = fields.state.stringValue;
        doc.recipient_count = Number(fields.recipient_count.integerValue);
        doc.failure_count = Number(fields.failure_count.integerValue);
        doc.recipient_results = Object.fromEntries(Object.entries(fields.recipient_results.mapValue.fields).map(([k,v])=>[k,{uid:v.mapValue.fields.uid.stringValue,status:v.mapValue.fields.status.stringValue}]));
      }
      return response(doc);
    }
    if (url.includes("push_recovery_attempts?documentId=")) {
      const id = new URL(url).searchParams.get("documentId");
      if (attempts.has(id)) return new Response("exists",{status:409});
      attempts.set(id,{state:"claimed"});
      return Response.json({name:id});
    }
    if (url.includes("/push_recovery_attempts/")) {
      const id = url.split("/push_recovery_attempts/")[1].split("?")[0];
      if (!attempts.has(id)) return new Response("missing",{status:404});
      if (init.method === "PATCH") {
        if (failAttemptPatch) return new Response("simulated failure",{status:503});
        attempts.get(id).state = JSON.parse(init.body).fields.state.stringValue;
      }
      return response(attempts.get(id));
    }
    if (url.includes("/messages:send")) { sends++; return Response.json({name:"accepted"}); }
    throw new Error("Unexpected request "+url);
  };
  const request = (operation) => new Request("https://worker.example/api/notify",{method:"POST",headers:{origin:env.ALLOWED_ORIGIN,"content-type":"application/json",authorization:"Bearer "+jwt},body:JSON.stringify({auditId:"audit-event-1",operation})});
  try {
    // Simulate a prior FCM rejection; no send is needed to seed the record.
    const eventKey = await (await import("../src/index.js")).stableEventKey("chamado_criado",call);
    events.set(eventKey,{audit_id:"audit-event-1",state:"partial",recipient_count:1,failure_count:1,recipient_results:{[key]:{uid:"operator-1",status:"rejected"}}});
    const [a,b] = await Promise.all([worker.fetch(request("recover"),env),worker.fetch(request("recover"),env)]);
    assert.deepEqual([a.status,b.status].sort((x,y)=>x-y),[200,409]);
    assert.equal(sends,1,"concurrent requests must send exactly once");
    assert.equal((await worker.fetch(request("recover"),env)).status,409);
    assert.equal(sends,1);

    call.criado_em = "2026-10-18T10:01:00Z";
    const secondKey = await (await import("../src/index.js")).stableEventKey("chamado_criado",call);
    events.set(secondKey,{audit_id:"audit-event-1",state:"partial",recipient_count:1,failure_count:1,recipient_results:{[key]:{uid:"operator-1",status:"rejected"}}});
    failAttemptPatch = true;
    assert.equal((await worker.fetch(request("recover"),env)).status,502);
    failAttemptPatch = false;
    assert.equal(sends,2);
    assert.equal((await worker.fetch(request("recover"),env)).status,409);
    assert.equal(sends,2,"failed persistence must not permit duplicate sends");

    call.criado_em = "2026-10-18T10:02:00Z";
    const thirdKey = await (await import("../src/index.js")).stableEventKey("chamado_criado",call);
    events.set(thirdKey,{audit_id:"audit-event-1",state:"partial",recipient_count:1,failure_count:1,recipient_results:{[key]:{uid:"operator-1",status:"rejected"}}});
    tenantToken = true;
    assert.equal((await worker.fetch(request("recover"),env)).status,409);
    assert.equal(sends,2,"cross-company token must never receive a notification");
    tenantToken = false;
    call.empresa_id = "company-b";
    assert.equal((await worker.fetch(request("recover"),env)).status,403);
    assert.equal(sends,2);
  } finally { globalThis.fetch = originalFetch; }
});
