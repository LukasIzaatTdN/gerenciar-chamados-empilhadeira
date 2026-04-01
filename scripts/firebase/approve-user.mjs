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
const supermercadoId = requireArg("supermercado-id");
const nome = readArg("nome");
const serviceAccountPath = requireArg("service-account");

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error("Arquivo service account não encontrado");
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const claims = {
  perfil,
  supermercado_id: supermercadoId,
  nome: nome ?? undefined,
};

await admin.auth().setCustomUserClaims(uid, claims);

await firestore.collection("usuarios").doc(uid).set(
  {
    id: uid,
    perfil,
    supermercado_id: supermercadoId,
    status: "Ativo",
    aprovado_em: new Date().toISOString(),
    nome: nome ?? undefined,
  },
  { merge: true }
);

console.log("Usuário aprovado com sucesso.");
console.log(JSON.stringify({ uid, perfil, supermercado_id: supermercadoId }, null, 2));
