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

function normalizeId(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const serviceAccountPath = requireArg("service-account");
const supermercadoNome = requireArg("supermercado-nome");
const supermercadoCodigo = requireArg("supermercado-codigo");
const supermercadoEndereco = requireArg("supermercado-endereco");
const adminNome = requireArg("admin-nome");
const adminEmail = requireArg("admin-email");
const adminPassword = requireArg("admin-password");
const adminPerfil = readArg("admin-perfil") ?? "Administrador Geral";
const supermarketIdArg = readArg("supermercado-id");

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error("Arquivo service account não encontrado");
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const supermercadoId =
  supermarketIdArg?.trim() || `sm-${normalizeId(supermercadoCodigo)}`;
const supermercadoDoc = {
  id: supermercadoId,
  nome: supermercadoNome.trim(),
  codigo: supermercadoCodigo.trim().toUpperCase(),
  endereco: supermercadoEndereco.trim(),
  status: "Ativo",
  criado_em: new Date().toISOString(),
};

await firestore.collection("supermercados").doc(supermercadoId).set(supermercadoDoc, {
  merge: true,
});

let userRecord;
try {
  userRecord = await admin.auth().getUserByEmail(adminEmail.trim().toLowerCase());
  await admin.auth().updateUser(userRecord.uid, {
    displayName: adminNome.trim(),
    password: adminPassword,
  });
} catch (error) {
  if (error?.code !== "auth/user-not-found") {
    throw error;
  }
  userRecord = await admin.auth().createUser({
    email: adminEmail.trim().toLowerCase(),
    password: adminPassword,
    displayName: adminNome.trim(),
    emailVerified: true,
  });
}

const uid = userRecord.uid;
const supermercadoClaim = adminPerfil === "Administrador Geral" ? null : supermercadoId;

await admin.auth().setCustomUserClaims(uid, {
  perfil: adminPerfil,
  supermercado_id: supermercadoClaim,
  nome: adminNome.trim(),
});

await firestore.collection("usuarios").doc(uid).set(
  {
    id: uid,
    nome: adminNome.trim(),
    email: adminEmail.trim().toLowerCase(),
    perfil: adminPerfil,
    supermercado_id: supermercadoClaim,
    status: "Ativo",
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  },
  { merge: true }
);

console.log("Bootstrap concluido com sucesso.");
console.log(
  JSON.stringify(
    {
      supermercado: supermercadoDoc,
      usuario: {
        uid,
        email: adminEmail.trim().toLowerCase(),
        perfil: adminPerfil,
        supermercado_id: supermercadoClaim,
      },
    },
    null,
    2
  )
);
