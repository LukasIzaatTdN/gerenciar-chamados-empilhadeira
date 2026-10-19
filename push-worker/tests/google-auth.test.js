import test from "node:test";
import assert from "node:assert/strict";
import { getGoogleAccessToken, validateFederationConfig } from "../src/google-auth.js";

const audience = "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/patio-pool/providers/oidc-provider";
const email = "patio-pro-log-push-worker@painel-772bf.iam.gserviceaccount.com";

test("WIF refuses missing trusted identity provider", async () => {
  assert.throws(() => validateFederationConfig({ WIF_AUDIENCE: audience, WIF_SERVICE_ACCOUNT_EMAIL: email }), /Provedor de identidade/);
  await assert.rejects(getGoogleAccessToken({ GOOGLE_AUTH_MODE: "wif", WIF_AUDIENCE: audience, WIF_SERVICE_ACCOUNT_EMAIL: email }), /Provedor de identidade/);
});

test("WIF refuses arbitrary service accounts and malformed audiences", () => {
  const provider = { getSubjectToken: async () => "not-a-real-token" };
  assert.throws(() => validateFederationConfig({ WIF_AUDIENCE: audience, WIF_SERVICE_ACCOUNT_EMAIL: "other@example.com", WIF_IDENTITY_PROVIDER: provider }), /não autorizada/);
  assert.throws(() => validateFederationConfig({ WIF_AUDIENCE: "https://evil.example/token", WIF_SERVICE_ACCOUNT_EMAIL: email, WIF_IDENTITY_PROVIDER: provider }), /audience/);
});

test("unknown auth mode fails closed", async () => {
  await assert.rejects(getGoogleAccessToken({ GOOGLE_AUTH_MODE: "unexpected" }), /inválido/);
});

test("WIF refuses missing external subject token before contacting Google", async () => {
  const env = { GOOGLE_AUTH_MODE: "wif", WIF_AUDIENCE: audience, WIF_SERVICE_ACCOUNT_EMAIL: email,
    WIF_IDENTITY_PROVIDER: { getSubjectToken: async () => "" } };
  await assert.rejects(getGoogleAccessToken(env), /ausente ou inválida/);
});
