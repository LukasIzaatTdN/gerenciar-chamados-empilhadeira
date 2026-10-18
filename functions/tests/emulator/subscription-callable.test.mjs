import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "demo-patio-pro-log";
const clientApp = initializeApp({ apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId, appId: "1:0:web:saas-test" }, `saas-test-${Date.now()}`);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://127.0.0.1:${process.env.PATIO_AUTH_EMULATOR_PORT || "9099"}`, { disableWarnings: true });
const functions = getFunctions(clientApp, "us-central1");
connectFunctionsEmulator(functions, "127.0.0.1", Number(process.env.PATIO_FUNCTIONS_EMULATOR_PORT || "5001"));
const callManageSubscription = httpsCallable(functions, "manageSubscription");
const adminApp = initializeAdminApp({ projectId }, `saas-admin-${Date.now()}`);
const adminDb = getFirestore(adminApp);
const suffix = Date.now().toString();
const companyId = "empresa-emulator-51";
const planId = `plano-emulator-199-mensal-${suffix}`;
const plan = {
  nome: `Plano SaaS Mensal 199 ${suffix}`,
  descricao: "Plano fictício de validação local",
  valor_centavos: 19900,
  ciclo: "Mensal",
  limite_usuarios: null,
  limite_filiais: null,
  status: "Ativo",
};
const operationId = () => randomUUID();
const call = (payload, id = operationId()) => callManageSubscription({ ...payload, operationId: id });

async function createUser(email, role, status) {
  const credential = await createUserWithEmailAndPassword(auth, email, "Emulator-only-password-123");
  await adminDb.doc(`usuarios/${credential.user.uid}`).set({ nome: role, perfil: role, status });
  return credential;
}

try {
  const platformAdmin = await createUser(`platform-${suffix}@example.test`, "Administrador Geral", "Ativo");
  const saveId = operationId();
  const result = await call({ action: "savePlan", planId, plan }, saveId);
  const duplicateResult = await call({ action: "savePlan", planId, plan }, saveId);
  assert.equal(result.data.planId, planId);
  assert.equal(duplicateResult.data.planId, planId, "saving the same plan ID should update the existing plan");
  const savedPlan = await adminDb.doc(`planos/${planId}`).get();
  assert.equal(savedPlan.exists, true, "callable should save the plan in the Firestore emulator");
  assert.equal(savedPlan.data().valor_centavos, 19900);
  const audit = await adminDb.collection("auditoria_assinaturas").where("plano_id", "==", planId).get();
  assert.equal(audit.size, 1, "a retry must not append another audit event");
  assert.deepEqual(audit.docs.map((doc) => doc.data().acao), ["plano_criado"]);
  await assert.rejects(
    call({ action: "savePlan", planId, plan: { ...plan, valor_centavos: 100 } }, saveId),
    (error) => error.code === "functions/failed-precondition",
    "an operation ID cannot be reused for a different request payload",
  );
  await call({ action: "savePlan", planId, plan: { ...plan, descricao: "Edição independente" } });
  assert.equal((await adminDb.collection("auditoria_assinaturas").where("plano_id", "==", planId).get()).size, 2,
    "a distinct authorized operation can edit the plan");

  await assert.rejects(
    call({ action: "savePlan", planId: `invalido-${suffix}`, plan: { ...plan, valor_centavos: -1 } }),
    (error) => error.code === "functions/invalid-argument",
    "invalid plan values must be rejected with invalid-argument",
  );
  await assert.rejects(
    call({ action: "savePlan", planId: `status-invalido-${suffix}`, plan: { ...plan, status: "Desconhecido" } }),
    (error) => error.code === "functions/invalid-argument",
    "unknown plan statuses must be rejected",
  );

  await adminDb.doc(`empresas/${companyId}`).set({ nome: "Empresa Fictícia do Emulator", status: "Ativa" });
  const assignId = operationId();
  await call({ action: "assignPlan", empresaId: companyId, planId }, assignId);
  await call({ action: "assignPlan", empresaId: companyId, planId }, assignId);
  await call({ action: "assignPlan", empresaId: companyId, planId });
  const currentSubscription = await adminDb.doc(`empresas/${companyId}/assinaturas/atual`).get();
  const subscriptionDocs = await adminDb.collection(`empresas/${companyId}/assinaturas`).get();
  assert.equal(currentSubscription.exists, true, "the fictitious company should receive its plan");
  assert.equal(subscriptionDocs.size, 1, "a company should have exactly one canonical subscription document");

  const activateId = operationId();
  const [activationA, activationB] = await Promise.all([
    call({ action: "activate", empresaId: companyId, planId }, activateId),
    call({ action: "activate", empresaId: companyId, planId }, activateId),
  ]);
  assert.deepEqual(activationA.data, activationB.data, "concurrent activation retries return the stored result");
  await call({ action: "activate", empresaId: companyId, planId }, activateId);
  const activated = await adminDb.doc(`empresas/${companyId}/assinaturas/atual`).get();
  assert.equal(activated.data().status, "Ativa");
  const firstDueDate = new Date(activated.data().vence_em);
  assert.equal((await adminDb.collection(`empresas/${companyId}/historico_assinatura`).where("acao", "==", "assinatura_ativada").get()).size, 1);
  await assert.rejects(call({ action: "activate", empresaId: companyId, planId }), (error) => error.code === "functions/failed-precondition",
    "a new activation operation is not allowed after activation");
  const renewId = operationId();
  const renewResults = await Promise.all(Array.from({ length: 5 }, () => call({ action: "renew", empresaId: companyId, planId }, renewId)));
  assert.ok(renewResults.every((item) => item.data.vence_em === renewResults[0].data.vence_em), "concurrent retries share one renewal result");
  await call({ action: "renew", empresaId: companyId, planId }, renewId);
  const renewed = await adminDb.doc(`empresas/${companyId}/assinaturas/atual`).get();
  const firstRenewalDueDate = new Date(renewed.data().vence_em);
  assert.ok(firstRenewalDueDate > firstDueDate, "manual renewal should extend the due date");
  assert.equal((await adminDb.collection(`empresas/${companyId}/historico_assinatura`).where("acao", "==", "assinatura_renovada").get()).size, 1,
    "retries must not duplicate renewal history");
  await Promise.all([
    call({ action: "renew", empresaId: companyId, planId }),
    call({ action: "renew", empresaId: companyId, planId }),
  ]);
  const twiceRenewed = await adminDb.doc(`empresas/${companyId}/assinaturas/atual`).get();
  assert.ok(new Date(twiceRenewed.data().vence_em) > firstRenewalDueDate, "different operation IDs both renew serially");
  assert.equal((await adminDb.collection(`empresas/${companyId}/historico_assinatura`).where("acao", "==", "assinatura_renovada").get()).size, 3);
  assert.equal((await adminDb.collection(`empresas/${companyId}/assinaturas`).get()).size, 1);
  const history = await adminDb.collection(`empresas/${companyId}/historico_assinatura`).get();
  assert.deepEqual(history.docs.map((doc) => doc.data().acao).sort(), [
    "assinatura_ativada",
    "assinatura_renovada", "assinatura_renovada", "assinatura_renovada",
    "plano_vinculado",
  ]);
  assert.equal(history.size, 5, "only distinct mutations append history");

  for (const status of ["Suspensa", "Cancelada", "Desconhecido"]) {
    const blockedCompanyId = `empresa-${status.toLowerCase()}-${suffix}`;
    await adminDb.doc(`empresas/${blockedCompanyId}`).set({ nome: "Empresa de transição inválida" });
    await adminDb.doc(`empresas/${blockedCompanyId}/assinaturas/atual`).set({ empresa_id: blockedCompanyId, plano_id: planId, status, vence_em: null });
    await assert.rejects(call({ action: "renew", empresaId: blockedCompanyId, planId }), (error) => error.code === "functions/failed-precondition",
      `${status} subscriptions must reject renewal`);
  }

  await auth.signOut();
  const companyAdmin = await createUser(`company-${suffix}@example.test`, "Administrador da Empresa", "Ativo");
  await adminDb.doc(`usuarios/${companyAdmin.user.uid}`).update({ empresa_id: companyId });
  await assert.rejects(
    call({ action: "savePlan", plan: { ...plan, nome: "Invasao", valor_centavos: 1 } }),
    (error) => error.code === "functions/permission-denied",
    "company administrators must not run platform plan operations",
  );
  await assert.rejects(
    call({ action: "assignPlan", empresaId: companyId, planId }),
    (error) => error.code === "functions/permission-denied",
    "company administrators must not manage subscriptions through the callable",
  );
  assert.ok(companyAdmin.user.uid);
  await auth.signOut();

  const inactiveAdmin = await createUser(`inactive-${suffix}@example.test`, "Administrador Geral", "Inativo");
  await assert.rejects(
    call({ action: "savePlan", plan: { ...plan, nome: "Inativo", valor_centavos: 1 } }),
    (error) => error.code === "functions/permission-denied",
    "inactive platform administrators must be denied",
  );
  assert.ok(inactiveAdmin.user.uid);
  console.log("Emulator callable tests passed; all writes used demo-patio-pro-log emulators.");
} finally {
  await auth.signOut();
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}
