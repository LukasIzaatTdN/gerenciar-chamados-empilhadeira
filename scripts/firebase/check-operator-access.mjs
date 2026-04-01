#!/usr/bin/env node

import admin from "firebase-admin";
import fs from "node:fs";

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function requireArg(name) {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Parâmetro obrigatório ausente: --${name}`);
  }
  return value;
}

function isText(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isCampoVazio(v) {
  return v == null || (typeof v === "string" && v.length === 0);
}

function isStatusChamadoValido(status) {
  return status === "Aguardando" || status === "Em atendimento" || status === "Finalizado";
}

function isPrioridadeValida(prioridade) {
  return prioridade === "Normal" || prioridade === "Urgente";
}

function isTipoServicoValido(tipo) {
  return (
    tipo === "Descarga" ||
    tipo === "Reposição" ||
    tipo === "Retirada" ||
    tipo === "Movimentação"
  );
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isAtualizacaoOperacionalPermitida(resourceData, requestData) {
  const changedKeys = new Set(
    Object.keys({ ...resourceData, ...requestData }).filter(
      (k) => JSON.stringify(resourceData[k]) !== JSON.stringify(requestData[k])
    )
  );
  const allowedKeys = new Set([
    "status",
    "operador_nome",
    "iniciado_em",
    "finalizado_em",
    "atualizado_em",
  ]);

  const onlyAllowedChanges = [...changedKeys].every((k) => allowedKeys.has(k));
  const idOk =
    requestData.id === resourceData.id ||
    (!Object.hasOwn(resourceData, "id") && !Object.hasOwn(requestData, "id"));

  return (
    requestData.supermercado_id === resourceData.supermercado_id &&
    requestData.solicitante_nome === resourceData.solicitante_nome &&
    requestData.setor === resourceData.setor &&
    requestData.tipo_servico === resourceData.tipo_servico &&
    requestData.prioridade === resourceData.prioridade &&
    requestData.criado_em === resourceData.criado_em &&
    idOk &&
    onlyAllowedChanges &&
    isStatusChamadoValido(requestData.status) &&
    (isCampoVazio(requestData.operador_nome) || isText(requestData.operador_nome)) &&
    (requestData.iniciado_em == null || typeof requestData.iniciado_em === "string") &&
    (requestData.finalizado_em == null || typeof requestData.finalizado_em === "string")
  );
}

function isTransicaoStatusPermitida(resourceData, requestData) {
  const from = resourceData.status;
  const to = requestData.status;

  const fromAguardando =
    from === "Aguardando" &&
    (to === "Aguardando" ||
      (to === "Em atendimento" &&
        requestData.iniciado_em != null &&
        isCampoVazio(requestData.finalizado_em)));

  const fromEmAtendimento =
    from === "Em atendimento" &&
    (to === "Em atendimento" ||
      (to === "Finalizado" &&
        requestData.iniciado_em != null &&
        requestData.finalizado_em != null));

  const fromFinalizado = from === "Finalizado" && to === "Finalizado";

  const fromInvalido =
    !isStatusChamadoValido(from) &&
    (to === "Aguardando" ||
      (to === "Em atendimento" &&
        requestData.iniciado_em != null &&
        isCampoVazio(requestData.finalizado_em)) ||
      (to === "Finalizado" &&
        requestData.iniciado_em != null &&
        requestData.finalizado_em != null));

  return fromAguardando || fromEmAtendimento || fromFinalizado || fromInvalido;
}

function isChamadoBaseValido(data) {
  return (
    isText(data.id) &&
    isText(data.supermercado_id) &&
    isText(data.solicitante_nome) &&
    isText(data.setor) &&
    isTipoServicoValido(data.tipo_servico) &&
    isPrioridadeValida(data.prioridade) &&
    isStatusChamadoValido(data.status) &&
    isText(data.criado_em) &&
    (isCampoVazio(data.operador_nome) || isText(data.operador_nome)) &&
    (isCampoVazio(data.iniciado_em) || isText(data.iniciado_em)) &&
    (isCampoVazio(data.finalizado_em) || isText(data.finalizado_em))
  );
}

function printCheck(label, ok, detail = "") {
  const mark = ok ? "OK" : "FAIL";
  console.log(`${mark} - ${label}${detail ? `: ${detail}` : ""}`);
}

const uid = requireArg("uid");
const chamadoId = requireArg("chamado-id");
const serviceAccountPath = requireArg("service-account");

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error("Arquivo service account não encontrado");
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const authUser = await admin.auth().getUser(uid);
const claims = authUser.customClaims ?? {};
const userSnap = await firestore.collection("usuarios").doc(uid).get();
const chamadoSnap = await firestore.collection("chamados").doc(chamadoId).get();

if (!userSnap.exists) {
  throw new Error(`Documento usuarios/${uid} não encontrado`);
}
if (!chamadoSnap.exists) {
  throw new Error(`Documento chamados/${chamadoId} não encontrado`);
}

const userDoc = userSnap.data() ?? {};
const chamado = chamadoSnap.data() ?? {};

const perfilResolved = userDoc.perfil ?? claims.perfil ?? null;
const supermercadoResolved = userDoc.supermercado_id ?? claims.supermercado_id ?? null;
const isOperador = perfilResolved === "Operador";
const isSupervisor = perfilResolved === "Supervisor";
const isAdmin = perfilResolved === "Administrador Geral";
const userAtivo = userDoc.status == null || userDoc.status === "Ativo";
const mesmaUnidade =
  isText(supermercadoResolved) && chamado.supermercado_id === supermercadoResolved;

const baseValido = isChamadoBaseValido(chamado);

console.log("\n=== Diagnóstico de Acesso (Operador/Chamado) ===");
console.log(
  JSON.stringify(
    {
      uid,
      chamadoId,
      perfilResolved,
      supermercadoResolved,
      claims,
      userDoc: {
        id: userDoc.id,
        nome: userDoc.nome,
        perfil: userDoc.perfil,
        supermercado_id: userDoc.supermercado_id,
        status: userDoc.status,
      },
      chamadoResumo: {
        id: chamado.id,
        status: chamado.status,
        supermercado_id: chamado.supermercado_id,
        operador_nome: chamado.operador_nome ?? null,
      },
    },
    null,
    2
  )
);

console.log("\n--- Checks básicos ---");
printCheck("Usuário ativo", userAtivo, `status=${String(userDoc.status ?? "Ativo")}`);
printCheck("Perfil de operador/supervisor/admin", isOperador || isSupervisor || isAdmin, String(perfilResolved));
printCheck("Mesma unidade entre usuário e chamado", mesmaUnidade, `${String(supermercadoResolved)} vs ${String(chamado.supermercado_id)}`);
printCheck("Chamado base válido p/ regras", baseValido, `status=${String(chamado.status)}`);

const canRead = isAdmin || mesmaUnidade;
printCheck("Pode ler chamado (rules)", canRead);

const assumePayload = clone(chamado);
assumePayload.status = "Aguardando";
assumePayload.operador_nome = userDoc.nome ?? authUser.displayName ?? authUser.email ?? "Operador";
assumePayload.atualizado_em = new Date().toISOString();

const assumePermitido =
  (isAdmin ||
    ((isOperador || isSupervisor) &&
      isAtualizacaoOperacionalPermitida(chamado, assumePayload) &&
      isTransicaoStatusPermitida(chamado, assumePayload) &&
      mesmaUnidade)) &&
  canRead;

console.log("\n--- Simulação de ASSUMIR ---");
printCheck("isAtualizacaoOperacionalPermitida", isAtualizacaoOperacionalPermitida(chamado, assumePayload));
printCheck("isTransicaoStatusPermitida", isTransicaoStatusPermitida(chamado, assumePayload));
printCheck("Assumir permitido", assumePermitido);

const iniciarPayload = clone(chamado);
iniciarPayload.status = "Em atendimento";
iniciarPayload.operador_nome = calledSafeOperator(chamado, userDoc, authUser);
iniciarPayload.iniciado_em = new Date().toISOString();
iniciarPayload.finalizado_em = null;
iniciarPayload.atualizado_em = new Date().toISOString();

const iniciarPermitido =
  (isAdmin ||
    ((isOperador || isSupervisor) &&
      isAtualizacaoOperacionalPermitida(chamado, iniciarPayload) &&
      isTransicaoStatusPermitida(chamado, iniciarPayload) &&
      mesmaUnidade)) &&
  canRead;

console.log("\n--- Simulação de INICIAR ---");
printCheck("isAtualizacaoOperacionalPermitida", isAtualizacaoOperacionalPermitida(chamado, iniciarPayload));
printCheck("isTransicaoStatusPermitida", isTransicaoStatusPermitida(chamado, iniciarPayload));
printCheck("Iniciar permitido", iniciarPermitido);

if (!assumePermitido || !iniciarPermitido) {
  console.log("\nAção recomendada:");
  console.log("- validar perfil/supermercado_id em usuarios/{uid}");
  console.log("- validar supermercado_id e status do chamado");
  console.log("- renovar sessão (logout/login) para atualizar token");
  console.log("- redeploy de regras: firebase deploy --only firestore:rules");
}

function calledSafeOperator(chamadoData, userData, authData) {
  if (isText(chamadoData.operador_nome)) return chamadoData.operador_nome;
  if (isText(userData.nome)) return userData.nome;
  if (isText(authData.displayName)) return authData.displayName;
  if (isText(authData.email)) return authData.email;
  return "Operador";
}
