#!/usr/bin/env node

import admin from "firebase-admin";
import fs from "node:fs";

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requireArg(name) {
  const value = readArg(name);
  if (!value) throw new Error(`Parâmetro obrigatório ausente: --${name}`);
  return value;
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function resolveUidFromData(data) {
  const uidCandidates = [
    data?.uid,
    data?.auth_uid,
    data?.firebase_uid,
    data?.id,
  ].filter(isNonEmptyText);

  for (const uidCandidate of uidCandidates) {
    try {
      const user = await admin.auth().getUser(uidCandidate.trim());
      return user.uid;
    } catch {
      // keep trying
    }
  }

  if (isNonEmptyText(data?.email)) {
    try {
      const user = await admin.auth().getUserByEmail(data.email.trim().toLowerCase());
      return user.uid;
    } catch {
      // no user with this email
    }
  }

  return null;
}

const serviceAccountPath = requireArg("service-account");
const commit = hasFlag("commit");
const deleteLegacy = hasFlag("delete-legacy");

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Arquivo não encontrado: ${serviceAccountPath}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
const usuariosRef = firestore.collection("usuarios");
const snapshot = await usuariosRef.get();

const report = {
  total: snapshot.size,
  alreadyUidDocs: 0,
  migrated: 0,
  skippedNoUid: 0,
  conflicts: 0,
  legacyDeleted: 0,
};

const actions = [];

for (const docSnap of snapshot.docs) {
  const legacyDocId = docSnap.id;
  const data = docSnap.data() ?? {};

  const uid = await resolveUidFromData(data);

  if (!uid) {
    report.skippedNoUid += 1;
    actions.push({
      status: "SKIP_NO_UID",
      legacyDocId,
      email: data.email ?? null,
      nome: data.nome ?? null,
    });
    continue;
  }

  const legacyEqualsUid = legacyDocId === uid;
  if (legacyEqualsUid) {
    report.alreadyUidDocs += 1;
    continue;
  }

  const targetRef = usuariosRef.doc(uid);
  const targetSnap = await targetRef.get();
  if (targetSnap.exists) {
    report.conflicts += 1;
    actions.push({
      status: "CONFLICT_TARGET_EXISTS",
      legacyDocId,
      uid,
      email: data.email ?? null,
    });

    if (commit && deleteLegacy) {
      await docSnap.ref.update({
        migrado_para_uid: uid,
        migrado_em: new Date().toISOString(),
        migracao_status: "legacy_conflict",
      });
    }
    continue;
  }

  const migratedDoc = {
    ...data,
    id: uid,
    uid,
    legado_doc_id: legacyDocId,
    atualizado_em: new Date().toISOString(),
  };

  actions.push({
    status: commit ? "MIGRATED" : "DRY_RUN_MIGRATE",
    legacyDocId,
    uid,
    email: data.email ?? null,
  });

  if (commit) {
    await targetRef.set(migratedDoc, { merge: true });
    report.migrated += 1;

    if (deleteLegacy) {
      await docSnap.ref.delete();
      report.legacyDeleted += 1;
    } else {
      await docSnap.ref.update({
        migrado_para_uid: uid,
        migrado_em: new Date().toISOString(),
        migracao_status: "copiado_para_uid",
      });
    }
  }
}

console.log("\n=== Migração usuarios legacy -> uid ===");
console.log(JSON.stringify({ mode: commit ? "commit" : "dry-run", deleteLegacy }, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("\nDetalhes:");
for (const item of actions) {
  console.log(JSON.stringify(item));
}

if (!commit) {
  console.log("\nNenhuma alteração foi gravada (dry-run). Use --commit para aplicar.");
}
