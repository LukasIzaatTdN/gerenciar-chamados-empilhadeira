// Google credential acquisition is isolated from notification business logic.
// WIF is opt-in and fails closed until a trusted runtime identity provider exists.
const OAUTH_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore";
const STS_URL = "https://sts.googleapis.com/v1/token";
const GOOGLE_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const EXTERNAL_JWT_TYPE = "urn:ietf:params:oauth:token-type:jwt";
let oauthCache;

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
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

async function getServiceAccountAccessToken(env) {
  if (oauthCache?.mode === "service_account_json" && oauthCache.expiresAt > Date.now() + 60_000) return oauthCache.token;
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
  oauthCache = { mode: "service_account_json", token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return oauthCache.token;
}



export function validateFederationConfig(env) {
  const audience = env.WIF_AUDIENCE;
  const email = env.WIF_SERVICE_ACCOUNT_EMAIL;
  if (typeof audience !== "string" || !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z][a-z0-9-]*\/providers\/[a-z][a-z0-9-]*$/.test(audience)) throw new Error("WIF audience inválida ou ausente.");
  if (email !== "patio-pro-log-push-worker@painel-772bf.iam.gserviceaccount.com") throw new Error("Conta de serviço WIF não autorizada.");
  if (!env.WIF_IDENTITY_PROVIDER || typeof env.WIF_IDENTITY_PROVIDER.getSubjectToken !== "function") throw new Error("Provedor de identidade WIF confiável não configurado.");
  return { audience, email };
}

async function getFederatedAccessToken(env) {
  const { audience, email } = validateFederationConfig(env);
  // This binding must be implemented by a trusted server-side identity issuer.
  // Never derive subject tokens from Firebase user tokens, request headers, or public variables.
  const subjectToken = await env.WIF_IDENTITY_PROVIDER.getSubjectToken(audience);
  if (typeof subjectToken !== "string" || subjectToken.length < 20) throw new Error("Identidade externa WIF ausente ou inválida.");
  const exchange = await fetch(STS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audience, grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: GOOGLE_TOKEN_TYPE, subjectTokenType: EXTERNAL_JWT_TYPE,
      subjectToken, scope: FCM_SCOPE }),
  });
  if (!exchange.ok) throw new Error(`Falha na troca de identidade WIF: HTTP ${exchange.status}`);
  const sts = await exchange.json();
  if (typeof sts.access_token !== "string" || !sts.access_token) throw new Error("STS não retornou token de acesso.");
  const impersonation = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:generateAccessToken`, {
    method: "POST",
    headers: { authorization: `Bearer ${sts.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ scope: FCM_SCOPE.split(" "), lifetime: "3600s" }),
  });
  if (!impersonation.ok) throw new Error(`Falha ao obter token temporário da conta de serviço: HTTP ${impersonation.status}`);
  const result = await impersonation.json();
  if (typeof result.accessToken !== "string" || !result.accessToken) throw new Error("IAM Credentials não retornou token.");
  const expiry = Date.parse(result.expireTime);
  if (!Number.isFinite(expiry) || expiry <= Date.now() + 60_000) throw new Error("Token temporário expirado ou sem validade verificável.");
  return { token: result.accessToken, expiresAt: expiry };
}

export async function getGoogleAccessToken(env) {
  const mode = env.GOOGLE_AUTH_MODE || "service_account_json";
  if (mode === "service_account_json") return getServiceAccountAccessToken(env);
  if (mode !== "wif") throw new Error("Modo de autenticação Google inválido.");
  if (oauthCache?.mode === "wif" && oauthCache.expiresAt > Date.now() + 60_000) return oauthCache.token;
  const token = await getFederatedAccessToken(env);
  oauthCache = { ...token, mode: "wif" };
  return token.token;
}
