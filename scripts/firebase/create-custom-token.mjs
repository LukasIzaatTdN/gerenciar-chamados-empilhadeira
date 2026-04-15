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

const uid = requireArg("uid");
const perfil = requireArg("perfil");
const empresaId = readArg("empresa-id");
const supermercadoId = readArg("supermercado-id");
const nome = readArg("nome");
const serviceAccountPath = readArg("service-account");

if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  throw new Error(
    "Informe um JSON de service account válido via --service-account /caminho/serviceAccount.json"
  );
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const additionalClaims = {
  perfil,
  empresa_id: empresaId ?? undefined,
  supermercado_id: supermercadoId ?? undefined,
  nome: nome ?? undefined,
};

const token = await admin.auth().createCustomToken(uid, additionalClaims);

console.log(token);
