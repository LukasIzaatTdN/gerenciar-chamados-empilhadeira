import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { runSubscriptionAdminOperation } from "../../../src/services/subscriptions.ts";

const projectId = "demo-patio-pro-log";
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios/platform-admin"), { perfil: "Administrador Geral", status: "Ativo", nome: "Admin Emulador" });
    await setDoc(doc(db, "empresas/empresa-client-test"), { nome: "Empresa de teste", status: "Ativa" });
  });
});

after(async () => environment.cleanup());

test("the web service replays the same operation once and serializes distinct concurrent renewals", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  const context = (operationId) => ({
    firestore: db,
    currentUser: { uid: "platform-admin", displayName: "Admin Emulador" },
    operationId,
    firestoreSdk: { doc, getDoc, runTransaction, serverTimestamp, Timestamp },
  });
  const plan = {
    nome: "Plano mensal", descricao: "Teste do cliente Web", valor_centavos: 19900,
    ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Ativo",
  };

  await runSubscriptionAdminOperation({ action: "savePlan", planId: "plano-mensal", plan }, context("web-plan-create-1"));
  await runSubscriptionAdminOperation({ action: "assignPlan", empresaId: "empresa-client-test", planId: "plano-mensal" }, context("web-assign-1"));

  const activation = { action: "activate", empresaId: "empresa-client-test", planId: "plano-mensal" };
  const activationResults = await Promise.all([
    runSubscriptionAdminOperation(activation, context("web-activate-same-1")),
    runSubscriptionAdminOperation(activation, context("web-activate-same-1")),
  ]);
  assert.equal(activationResults[0].status, "Ativa");
  assert.deepEqual(activationResults[0], activationResults[1]);

  const companyHistory = collection(db, "empresas", "empresa-client-test", "historico_assinatura");
  const afterActivation = (await getDocs(companyHistory)).docs.map((item) => item.data());
  assert.equal(afterActivation.filter((event) => event.acao === "assinatura_ativada").length, 1);

  const renewal = { action: "renew", empresaId: "empresa-client-test", planId: "plano-mensal" };
  const renewalReplayResults = await Promise.all([
    runSubscriptionAdminOperation(renewal, context("web-renew-same-1")),
    runSubscriptionAdminOperation(renewal, context("web-renew-same-1")),
  ]);
  assert.deepEqual(renewalReplayResults[0], renewalReplayResults[1]);
  const afterReplay = (await getDocs(companyHistory)).docs.map((item) => item.data());
  assert.equal(afterReplay.filter((event) => event.acao === "assinatura_renovada").length, 1);

  const subscriptionRef = doc(db, "empresas/empresa-client-test/assinaturas/atual");
  const priorExpiry = (await assertSucceeds(getDoc(subscriptionRef))).data().vence_em;
  await Promise.all([
    runSubscriptionAdminOperation(renewal, context("web-renew-distinct-a")),
    runSubscriptionAdminOperation(renewal, context("web-renew-distinct-b")),
  ]);
  const finalSubscription = (await getDoc(subscriptionRef)).data();
  const finalHistory = (await getDocs(companyHistory)).docs.map((item) => item.data());
  assert.equal(finalHistory.filter((event) => event.acao === "assinatura_renovada").length, 3);
  assert.ok(finalSubscription.vence_em instanceof Timestamp);
  assert.ok(finalSubscription.vence_em.toMillis() > priorExpiry.toMillis());
});
