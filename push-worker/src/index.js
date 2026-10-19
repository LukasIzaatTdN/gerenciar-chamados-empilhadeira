const FIREBASE_KEYS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const OAUTH_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore";
const ACTIVE_ROLES = new Set(["Operador", "Supervisor", "Separador de Televendas", "Administrador da Empresa"]);
let firebaseKeysCache;
let firebaseKeysExpiry = 0;
let oauthCache;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

async function getFirebaseKeys() {
  if (firebaseKeysCache && Date.now() < firebaseKeysExpiry) return firebaseKeysCache;
  const response = await fetch(FIREBASE_KEYS_URL);
  if (!response.ok) throw new Error(`Falha ao obter chaves públicas Firebase: HTTP ${response.status}`);
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseKeysCache = await response.json();
  firebaseKeysExpiry = Date.now() + maxAge * 1000;
  return firebaseKeysCache;
}

async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token Firebase inválido.");
  const header = decodeJsonSegment(parts[0]);
  const claims = decodeJsonSegment(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Assinatura de token não suportada.");
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Token pertence a outro projeto Firebase.");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new Error("UID inválido no token.");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60) throw new Error("Token expirado ou com data inválida.");
  const jwk = (await getFirebaseKeys()).keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Chave de assinatura Firebase desconhecida.");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, base64UrlToBytes(parts[2]), signedData))) throw new Error("Assinatura do token inválida.");
  return claims;
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return base64UrlToBytes(body.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
}

async function signJwt(payload, privateKeyPem) {
  const encoder = new TextEncoder();
  const encode = (value) => btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = encode({ alg: "RS256", typ: "JWT" });
  const body = encode(payload);
  const content = `${header}.${body}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(privateKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(content)));
  const encodedSignature = btoa(String.fromCharCode(...signature)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${content}.${encodedSignature}`;
}

async function getGoogleAccessToken(env) {
  if (oauthCache && oauthCache.expiresAt > Date.now() + 60_000) return oauthCache.token;
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Credencial de serviço ausente no Worker.");
  if (serviceAccount.project_id && serviceAccount.project_id !== env.FIREBASE_PROJECT_ID) throw new Error("A credencial configurada pertence a outro projeto Firebase.");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({ iss: serviceAccount.client_email, aud: OAUTH_URL, iat: now, exp: now + 3600, scope: FCM_SCOPE }, serviceAccount.private_key);
  const response = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(`Falha de autenticação Google: HTTP ${response.status}`);
  oauthCache = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return oauthCache.token;
}

async function firestoreRequest(env, path, init = {}) {
  const accessToken = await getGoogleAccessToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
  const url = path.startsWith(":") ? `${base}${path}` : `${base}/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Firestore REST HTTP ${response.status}: ${message.slice(0, 400)}`);
  }
  return response.status === 204 ? null : response.json();
}

function firestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValue);
  if ("mapValue" in value) return fields(value.mapValue);
  return null;
}

function fields(document) {
  const output = {};
  for (const [key, value] of Object.entries(document?.fields || {})) output[key] = firestoreValue(value);
  return output;
}

async function loadPushTokens(env, companyId, supermarketId) {
  const response = await firestoreRequest(env, `:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "push_tokens", allDescendants: true }],
      where: { fieldFilter: { field: { fieldPath: "empresa_id" }, op: "EQUAL", value: { stringValue: companyId } } },
    } }),
  });
  const tokens = [];
  for (const result of response) {
    const document = result.document;
    if (!document) continue;
    const token = fields(document);
    const match = document.name.match(/\/documents\/usuarios\/([^/]+)\/push_tokens\/([^/]+)$/);
    if (!match || match[1] === "") continue;
    const profile = fields(await firestoreRequest(env, `usuarios/${encodeURIComponent(match[1])}`).catch(() => null));
    const adminEmpresaCanSeeUnit = profile.perfil === "Administrador da Empresa"
      && (profile.supermercado_id === null || (Array.isArray(profile.supermercado_ids) && profile.supermercado_ids.includes(supermarketId)));
    if (profile.status !== "Ativo" || profile.empresa_id !== companyId || (profile.supermercado_id !== supermarketId && !adminEmpresaCanSeeUnit)) continue;
    if (token.uid !== match[1] || token.empresa_id !== profile.empresa_id || token.supermercado_id !== profile.supermercado_id || token.perfil !== profile.perfil || token.status !== "Ativo" || profile.empresa_id !== companyId || !ACTIVE_ROLES.has(profile.perfil) || typeof token.token !== "string") continue;
    tokens.push({ uid: match[1], token: token.token });
  }
  return tokens;
}

async function claimDelivery(env, eventKey, auditId) {
  try {
    await firestoreRequest(env, "push_delivery_events?documentId=" + encodeURIComponent(eventKey), {
      method: "POST",
      body: JSON.stringify({ fields: { audit_id: { stringValue: auditId }, event_key: { stringValue: eventKey }, state: { stringValue: "claimed" }, claimed_at: { timestampValue: new Date().toISOString() } } }),
    });
    return true;
  } catch (error) {
    if (String(error).includes("HTTP 409")) return false;
    throw error;
  }
}

export async function stableEventKey(action, call) {
  const timestamp = action === "chamado_criado" ? call.criado_em
    : action === "chamado_assumido" ? call.assumido_em
      : action === "chamado_iniciado" ? call.iniciado_em : call.finalizado_em;
  if (typeof timestamp !== "string" || !timestamp) throw new Error("O chamado ainda não contém o horário de estado necessário para notificação.");
  const bytes = new TextEncoder().encode(`${action}:${call.id}:${timestamp}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function eventMatchesCurrentCall(action, details, call) {
  if (action === "chamado_criado") return call.status === details.status;
  if (action === "chamado_assumido") return typeof call.assumido_em === "string" && call.operador_nome === details.operador_nome && call.status === details.statusAtual;
  if (action === "chamado_iniciado") return typeof call.iniciado_em === "string" && call.operador_nome === details.operador_nome && call.status === details.statusAtual;
  if (action === "chamado_finalizado") return typeof call.finalizado_em === "string" && call.status === "Finalizado" && details.statusAtual === "Finalizado";
  return false;
}

function eventCopy(action, call, auditId) {
  const titleByAction = {
    chamado_criado: "Novo chamado",
    chamado_assumido: "Chamado assumido",
    chamado_iniciado: "Atendimento iniciado",
    chamado_finalizado: "Atendimento finalizado",
  };
  const title = titleByAction[action];
  const description = [call.tipo_servico, call.setor].filter((part) => typeof part === "string" && part).join(" em ");
  const body = action === "chamado_criado"
    ? `${call.solicitante_nome || "Um usuário"} solicitou ${description || "um serviço"}.`
    : `${description || "Um chamado"} foi atualizado.`;
  return { title, body, type: action, chamadoId: call.id || "", eventId: auditId, url: "/" };
}

async function sendFcm(env, token, data) {
  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { token, data } }),
  });
  if (!response.ok) throw new Error(`FCM HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function handleNotify(request, env) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_JSON) return json({ error: "Serviço push ainda não configurado." }, 503);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Autenticação necessária." }, 401);
  let claims;
  try {
    claims = await verifyFirebaseIdToken(authorization.slice(7), env.FIREBASE_PROJECT_ID);
  } catch (error) {
    return json({ error: error.message || "Token inválido." }, 401);
  }
  const rawBody = await request.text();
  if (rawBody.length > 1024) return json({ error: "Corpo da solicitação muito grande." }, 413);
  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  const auditId = body?.auditId;
  if (typeof auditId !== "string" || !/^[A-Za-z0-9_-]{10,150}$/.test(auditId)) return json({ error: "Identificador de auditoria inválido." }, 400);
  try {
    const audit = fields(await firestoreRequest(env, `auditoria/${encodeURIComponent(auditId)}`));
    if (audit.actorUid !== claims.sub || audit.entityType !== "chamado" || !["chamado_criado", "chamado_assumido", "chamado_iniciado", "chamado_finalizado"].includes(audit.action)) return json({ error: "Evento não autorizado para envio." }, 403);
    const details = audit.details && typeof audit.details === "object" ? audit.details : {};
    const companyId = details.empresa_id || audit.empresa_id;
    const supermarketId = details.supermercado_id || audit.supermercado_id;
    if (!companyId || !supermarketId) return json({ error: "Escopo do evento incompleto." }, 422);
    const call = fields(await firestoreRequest(env, `chamados/${encodeURIComponent(audit.entityId)}`));
    const actor = fields(await firestoreRequest(env, `usuarios/${encodeURIComponent(claims.sub)}`));
    if (actor.status !== "Ativo" || (actor.perfil !== "Administrador Geral" && (actor.empresa_id !== companyId || actor.supermercado_id !== supermarketId))) return json({ error: "Usuário ativo e autorizado não confirmado." }, 403);
    if (call.empresa_id !== companyId || call.supermercado_id !== supermarketId) return json({ error: "Escopo do chamado não corresponde à auditoria." }, 403);
    if (audit.action === "chamado_criado" && call.solicitante_uid !== claims.sub) return json({ error: "O autor do evento não corresponde ao solicitante do chamado." }, 403);
    if (audit.action !== "chamado_criado" && actor.nome !== details.operador_nome) return json({ error: "O usuário autenticado não corresponde ao operador do evento." }, 403);
    if (["chamado_assumido", "chamado_iniciado", "chamado_finalizado"].includes(audit.action) && !["Operador", "Supervisor", "Separador de Televendas", "Administrador da Empresa", "Administrador Geral"].includes(actor.perfil)) return json({ error: "Perfil sem permissão para esta movimentação." }, 403);
    if (!eventMatchesCurrentCall(audit.action, details, call)) return json({ error: "O evento não corresponde ao estado atual do chamado." }, 409);
    const eventKey = await stableEventKey(audit.action, call);
    if (!(await claimDelivery(env, eventKey, auditId))) return json({ ok: true, duplicate: true });
    const recipients = (await loadPushTokens(env, companyId, supermarketId)).filter((item) => item.uid !== claims.sub);
    const data = eventCopy(audit.action, call, auditId);
    const results = await Promise.allSettled(recipients.map(({ token }) => sendFcm(env, token, data)));
    const failures = results.filter((result) => result.status === "rejected").length;
    await firestoreRequest(env, `push_delivery_events/${encodeURIComponent(eventKey)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { audit_id: { stringValue: auditId }, event_key: { stringValue: eventKey }, state: { stringValue: failures ? "partial" : "sent" }, recipient_count: { integerValue: String(recipients.length) }, failure_count: { integerValue: String(failures) }, completed_at: { timestampValue: new Date().toISOString() } } }),
    });
    return json({ ok: true, recipientCount: recipients.length, failureCount: failures });
  } catch (error) {
    console.error("Falha na entrega de push", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Não foi possível processar a notificação. Consulte os logs protegidos do Worker." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const corsHeaders = {
      "access-control-allow-origin": origin && origin === env.ALLOWED_ORIGIN ? origin : "null",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "Origem não autorizada." }, 403);
    const url = new URL(request.url);
    if (url.pathname !== "/api/notify" || request.method !== "POST") return json({ error: "Rota não encontrada." }, 404);
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Envie o evento em JSON." }, 415);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1024) return json({ error: "Corpo da solicitação muito grande." }, 413);
    const response = await handleNotify(request, env);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
