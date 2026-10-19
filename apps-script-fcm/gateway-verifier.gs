/**
 * Pátio Pro Log — HMAC verification prototype for Google Apps Script.
 * NOT DEPLOYABLE: intentionally has no doPost(), FCM call, or Firestore write.
 * Future caller must supply a durable, atomic claimNonce(nonce, timestamp)
 * and must validate the payload against canonical Firestore records.
 * Store a random >=32-character secret in Script Properties as PUSH_GATEWAY_HMAC_SECRET;
 * never put it in code, logs, the browser, or the Git repository.
 */
function verifyGatewayEnvelope_(envelope, claimNonce, nowMillis) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw Error("Envelope inválido.");
  if (envelope.version !== "ppl-hmac-v1") throw Error("Versão inválida.");
  if (typeof envelope.timestamp !== "number" || !Number.isSafeInteger(envelope.timestamp) ||
      Math.abs(nowMillis - envelope.timestamp) > 300000) throw Error("Timestamp fora da janela.");
  if (typeof envelope.nonce !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(envelope.nonce)) throw Error("Nonce inválido.");
  if (typeof envelope.payload !== "string" || envelope.payload.length < 2 || envelope.payload.length > 4096) throw Error("Payload inválido.");
  if (typeof envelope.signature !== "string" || !/^[0-9a-f]{64}$/.test(envelope.signature)) throw Error("Assinatura inválida.");
  const secret = PropertiesService.getScriptProperties().getProperty("PUSH_GATEWAY_HMAC_SECRET");
  if (!secret || secret.length < 32) throw Error("Segredo HMAC não configurado.");
  const message = envelope.version + "\\n" + envelope.timestamp + "\\n" + envelope.nonce + "\\n" + envelope.payload;
  const mac = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
  const actual = mac.map(function(byte) { return ("0" + (byte & 255).toString(16)).slice(-2); }).join("");
  // Fixed-length, constant-work comparison; never log signatures or secret.
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
  if (difference !== 0) throw Error("Assinatura inválida.");
  if (typeof claimNonce !== "function") throw Error("Proteção anti-replay não configurada.");
  // MUST atomically persist nonce BEFORE any privileged action. No in-memory set.
  if (claimNonce(envelope.nonce, envelope.timestamp) !== true) throw Error("Requisição repetida ou indisponível.");
  return JSON.parse(envelope.payload);
}
