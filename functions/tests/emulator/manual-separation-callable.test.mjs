import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "demo-patio-pro-log";
const suffix = Date.now().toString();
const clientApp = initializeApp({ apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId, appId: "1:0:web:manual-test" }, `manual-test-${suffix}`);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://127.0.0.1:${process.env.PATIO_AUTH_EMULATOR_PORT || "9099"}`, { disableWarnings: true });
const functions = getFunctions(clientApp, "us-central1");
connectFunctionsEmulator(functions, "127.0.0.1", Number(process.env.PATIO_FUNCTIONS_EMULATOR_PORT || "5001"));
const confirmManual = httpsCallable(functions, "confirmManualTelevendasItem");
const adminApp = initializeAdminApp({ projectId }, `manual-admin-${suffix}`);
const adminDb = getFirestore(adminApp);
const pedidoId = `pedido-manual-${suffix}`;
const separatorEmail = `separator-${suffix}@example.test`;
const uuid = () => randomUUID();

try {
  const credential = await createUserWithEmailAndPassword(auth, separatorEmail, "Emulator-only-password-123");
  const uid = credential.user.uid;
  await adminDb.doc(`usuarios/${uid}`).set({
    nome: "Separador de Teste", perfil: "Separador de Televendas", status: "Ativo",
    empresa_id: "empresa-test", supermercado_id: "unidade-test",
  });
  await adminDb.doc(`chamados/${pedidoId}`).set({
    id: pedidoId, categoria: "televendas", status: "Em separação",
    empresa_id: "empresa-test", supermercado_id: "unidade-test",
    operador_nome: "Separador de Teste", atualizado_em: new Date().toISOString(),
    itens: [
      { produto: "Leite", unidadeMedida: "Palete", quantidadeSolicitada: 1, quantidadeEncontrada: 1, quantidadeFaltante: 0 },
      { produto: "Detergente", unidadeMedida: "Caixa", quantidadeSolicitada: 5, quantidadeEncontrada: 0, quantidadeFaltante: 5 },
      { produto: "Chá", unidadeMedida: "Caixa", quantidadeSolicitada: 10, quantidadeEncontrada: 0, quantidadeFaltante: 10 },
    ],
    total_solicitado: 16, total_encontrado: 1, percentual_atendido: 6,
    confirmacoes_empilhadeira: { "call-leite": { item_index: 0, quantidade: 1, unidade_medida: "Palete" } },
  });

  const operationId = uuid();
  const payload = { pedidoId, operationId, itemIndex: 1, targetQuantity: 4 };
  const [first, retry] = await Promise.all([confirmManual(payload), confirmManual(payload)]);
  assert.equal(first.data.quantidadeEncontrada, 4);
  assert.equal(retry.data.quantidadeEncontrada, 4);
  const order = (await adminDb.doc(`chamados/${pedidoId}`).get()).data();
  assert.equal(order.itens[0].quantidadeEncontrada, 1, "forklift-confirmed item remains unchanged");
  assert.equal(order.itens[1].quantidadeEncontrada, 4, "manual item is confirmed");
  assert.equal(order.itens[2].quantidadeEncontrada, 0, "unrelated item remains unchanged");
  assert.equal(order.total_solicitado, 16);
  assert.equal(order.total_encontrado, 5);
  assert.equal(order.percentual_atendido, 31);
  const receipts = await adminDb.collection(`chamados/${pedidoId}/separacao_confirmacoes`).get();
  assert.equal(receipts.size, 1, "a concurrent retry does not duplicate the immutable receipt");
  assert.equal(receipts.docs[0].data().tipo, "manual");

  await assert.rejects(confirmManual({ pedidoId, operationId: uuid(), itemIndex: 0, targetQuantity: 1 }),
    (error) => error.code === "functions/failed-precondition",
    "a manual receipt cannot change an item already confirmed by a forklift");
  await assert.rejects(confirmManual({ pedidoId, operationId: uuid(), itemIndex: 2, targetQuantity: 11 }),
    (error) => error.code === "functions/failed-precondition",
    "manual confirmation cannot exceed the requested quantity");
  console.log("Manual Televendas confirmation callable emulator tests passed.");
} finally {
  await auth.signOut();
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}
