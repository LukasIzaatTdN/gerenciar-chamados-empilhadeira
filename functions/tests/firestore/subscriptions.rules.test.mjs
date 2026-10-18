import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";

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
    await setDoc(doc(db, "usuarios/platform-admin"), { perfil: "Administrador Geral", status: "Ativo", nome: "Plataforma" });
    await setDoc(doc(db, "usuarios/platform-admin-no-status"), { perfil: "Administrador Geral", nome: "Plataforma sem status" });
    await setDoc(doc(db, "usuarios/platform-admin-inactive"), { perfil: "Administrador Geral", status: "Inativo", nome: "Plataforma inativa" });
    await setDoc(doc(db, "usuarios/company-admin-a"), { perfil: "Administrador da Empresa", status: "Ativo", empresa_id: "empresa-a", nome: "Admin A" });
    await setDoc(doc(db, "usuarios/company-admin-no-status"), { perfil: "Administrador da Empresa", empresa_id: "empresa-a", nome: "Admin A sem status" });
    await setDoc(doc(db, "usuarios/company-admin-b"), { perfil: "Administrador da Empresa", status: "Ativo", empresa_id: "empresa-b", nome: "Admin B" });
    await setDoc(doc(db, "usuarios/company-admin-inactive"), { perfil: "Administrador da Empresa", status: "Inativo", empresa_id: "empresa-a", nome: "Admin A Inativo" });
    await setDoc(doc(db, "usuarios/client-a"), { perfil: "Promotor", status: "Ativo", empresa_id: "empresa-a", nome: "Cliente A" });
    await setDoc(doc(db, "usuarios/self-escalation"), {
      id: "self-escalation", perfil: "Promotor", status: "Ativo", empresa_id: "empresa-a",
      supermercado_id: null, nome: "Usuário comum", email: "user@example.test", criado_em: "2026-01-01T00:00:00.000Z",
    });
    await setDoc(doc(db, "planos/pro"), { id: "pro", nome: "Pro", descricao: "", valor_centavos: 10000, ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Ativo" });
    for (const empresaId of ["empresa-a", "empresa-b"]) {
      await setDoc(doc(db, "empresas", empresaId), { nome: empresaId, status: "Ativa" });
      const start = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));
      await setDoc(doc(db, "empresas", empresaId, "assinaturas", "atual"), {
        empresa_id: empresaId, plano_id: "pro", plano_nome: "Pro", status: "Ativa", ciclo: "Mensal", valor_centavos: 10000,
        inicio_em: start, vence_em: Timestamp.fromDate(new Date("2026-01-31T00:00:00.000Z")), renovacao_manual: true,
        cobranca_automatica: false, provedor_pagamento: null, criado_em: start, atualizado_em: start,
        atualizado_por: "platform-admin", ultima_operacao_id: "seed",
      });
      await setDoc(doc(db, "empresas", empresaId, "historico_assinatura", "evento-1"), { empresa_id: empresaId, acao: "assinatura_ativada" });
    }
    await setDoc(doc(db, "empresas/empresa-c"), { nome: "empresa-c", status: "Ativa" });
    await setDoc(doc(db, "auditoria_assinaturas/evento-1"), { empresa_id: "empresa-a", plano_id: "pro" });
  });
});

after(async () => environment.cleanup());

test("a user cannot self-register or promote their profile to platform admin", async () => {
  const db = environment.authenticatedContext("new-self-escalation").firestore();
  await assertFails(setDoc(doc(db, "usuarios/new-self-escalation"), {
    id: "new-self-escalation", perfil: "Administrador Geral", status: "Ativo", empresa_id: null,
    supermercado_id: null, nome: "Auto promovido", email: "attacker@example.test",
  }));

  const existingUser = environment.authenticatedContext("self-escalation").firestore();
  await assertFails(updateDoc(doc(existingUser, "usuarios/self-escalation"), {
    perfil: "Administrador Geral",
  }));
});

test("platform admin reads SaaS data, but isolated direct document writes are denied", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  await assertSucceeds(getDoc(doc(db, "planos/pro")));
  await assertSucceeds(getDoc(doc(db, "empresas/empresa-b/assinaturas/atual")));
  await assertSucceeds(getDoc(doc(db, "auditoria_assinaturas/evento-1")));
  await assertFails(updateDoc(doc(db, "empresas/empresa-a/assinaturas/atual"), { valor_centavos: 1, status: "Ativa" }));
  await assertFails(setDoc(doc(db, "planos/hacked"), { valor_centavos: 1 }));
  await assertFails(setDoc(doc(db, "assinatura_operacoes/forged"), { action: "renew" }));
  await assertFails(getDoc(doc(environment.authenticatedContext("platform-admin-no-status").firestore(), "assinatura_operacoes/op-1")));
  await assertFails(getDoc(doc(environment.authenticatedContext("platform-admin-inactive").firestore(), "planos/pro")));
});

test("an active platform admin can atomically create a plan, audit, and idempotency record", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  const operationId = "op-save-plan-1";
  const planId = "starter";
  const plan = {
    id: planId, nome: "Starter", descricao: "Plano de teste", valor_centavos: 19900,
    ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Ativo",
    criado_em: serverTimestamp(), atualizado_em: serverTimestamp(), ultima_operacao_id: operationId,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "planos", planId), plan);
  batch.set(doc(db, "auditoria_assinaturas", operationId), {
    acao: "plano_criado", plano_id: planId, operation_id: operationId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { nome: "Starter", valor_centavos: 19900, ciclo: "Mensal" },
  });
  batch.set(doc(db, "assinatura_operacoes", operationId), {
    operation_id: operationId, actor_uid: "platform-admin", action: "savePlan",
    request_data: { action: "savePlan", planId: null, plan: { nome: "Starter", descricao: "Plano de teste", valor_centavos: 19900, ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Ativo" } },
    target_id: planId, result: { planId }, processed_at: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test("platform operation records have a strict client schema", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  await assertSucceeds(setDoc(doc(db, "assinatura_operacoes/op-ledger-only"), {
    operation_id: "op-ledger-only", actor_uid: "platform-admin", action: "assignPlan",
    request_data: { action: "assignPlan", empresaId: "empresa-a", planId: "pro" },
    target_id: "empresa-a", result: { ok: true }, processed_at: serverTimestamp(),
  }));
});

test("history entries must be paired with their operation in one atomic batch", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  const operationId = "op-history-only";
  const batch = writeBatch(db);
  batch.set(doc(db, "empresas/empresa-b/historico_assinatura", operationId), {
    acao: "plano_vinculado", empresa_id: "empresa-b", plano_id: "pro", operation_id: operationId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { plano_anterior: null, plano_nome: "Pro", valor_centavos: 10000, filial_independente: true },
  });
  batch.set(doc(db, "assinatura_operacoes", operationId), {
    operation_id: operationId, actor_uid: "platform-admin", action: "assignPlan",
    request_data: { action: "assignPlan", empresaId: "empresa-b", planId: "pro" },
    target_id: "empresa-b", result: { ok: true }, processed_at: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test("one company subscription can only be created atomically with matching history and operation", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  const operationId = "op-assign-c-1";
  const subscription = {
    empresa_id: "empresa-c", plano_id: "pro", plano_nome: "Pro", status: "Pendente",
    ciclo: "Mensal", valor_centavos: 10000, inicio_em: null, vence_em: null,
    renovacao_manual: true, cobranca_automatica: false, provedor_pagamento: null,
    criado_em: serverTimestamp(), atualizado_em: serverTimestamp(), atualizado_por: "platform-admin", ultima_operacao_id: operationId,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "empresas/empresa-c/assinaturas/atual"), subscription);
  batch.set(doc(db, "empresas/empresa-c/historico_assinatura", operationId), {
    acao: "plano_vinculado", empresa_id: "empresa-c", plano_id: "pro", operation_id: operationId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { plano_anterior: null, plano_nome: "Pro", valor_centavos: 10000, filial_independente: true },
  });
  batch.set(doc(db, "assinatura_operacoes", operationId), {
    operation_id: operationId, actor_uid: "platform-admin", action: "assignPlan",
    request_data: { action: "assignPlan", empresaId: "empresa-c", planId: "pro" },
    target_id: "empresa-c", result: { ok: true, empresaId: "empresa-c", planId: "pro", status: "Pendente", vence_em: null }, processed_at: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
  const activationId = "op-activate-a-2";
  const activationBatch = writeBatch(db);
  const activationEnd = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  activationBatch.update(doc(db, "empresas/empresa-c/assinaturas/atual"), {
    status: "Ativa", inicio_em: serverTimestamp(), vence_em: activationEnd,
    atualizado_em: serverTimestamp(), atualizado_por: "platform-admin", ultima_operacao_id: activationId,
  });
  activationBatch.set(doc(db, "empresas/empresa-c/historico_assinatura", activationId), {
    acao: "assinatura_ativada", empresa_id: "empresa-c", plano_id: "pro", operation_id: activationId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { valor_centavos: 10000, ciclo: "Mensal", inicio_em: serverTimestamp(), vence_em: activationEnd, pagamento: "manual" },
  });
  activationBatch.set(doc(db, "assinatura_operacoes", activationId), {
    operation_id: activationId, actor_uid: "platform-admin", action: "activate",
    request_data: { action: "activate", empresaId: "empresa-c", planId: "pro" }, target_id: "empresa-c",
    result: { ok: true, empresaId: "empresa-c", planId: "pro", status: "Ativa" }, processed_at: serverTimestamp(),
  });
  await assertSucceeds(activationBatch.commit());

  const renewedId = "op-renew-a-3";
  const currentSubscription = (await getDoc(doc(db, "empresas/empresa-c/assinaturas/atual"))).data();
  const renewedFrom = currentSubscription.vence_em;
  const renewedEnd = Timestamp.fromDate(new Date(renewedFrom.toDate().getTime() + 30 * 24 * 60 * 60 * 1000));
  const renewalBatch = writeBatch(db);
  renewalBatch.update(doc(db, "empresas/empresa-c/assinaturas/atual"), {
    vence_em: renewedEnd, atualizado_em: serverTimestamp(), atualizado_por: "platform-admin", ultima_operacao_id: renewedId,
  });
  renewalBatch.set(doc(db, "empresas/empresa-c/historico_assinatura", renewedId), {
    acao: "assinatura_renovada", empresa_id: "empresa-c", plano_id: "pro", operation_id: renewedId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { valor_centavos: 10000, ciclo: "Mensal", inicio_em: renewedFrom, vence_em: renewedEnd, pagamento: "manual" },
  });
  renewalBatch.set(doc(db, "assinatura_operacoes", renewedId), {
    operation_id: renewedId, actor_uid: "platform-admin", action: "renew",
    request_data: { action: "renew", empresaId: "empresa-c", planId: "pro" }, target_id: "empresa-c",
    result: { ok: true, empresaId: "empresa-c", planId: "pro", status: "Ativa" }, processed_at: serverTimestamp(),
  });
  await assertSucceeds(renewalBatch.commit());

  await assertFails(setDoc(doc(db, "empresas/empresa-c/assinaturas/filial-2"), subscription));
  await assertFails(updateDoc(doc(environment.authenticatedContext("company-admin-a").firestore(), "empresas/empresa-a/assinaturas/atual"), { status: "Ativa" }));
});

test("platform admin writes must reject unknown statuses and invalid amounts", async () => {
  const db = environment.authenticatedContext("platform-admin").firestore();
  const operationId = "op-invalid-status";
  const batch = writeBatch(db);
  batch.set(doc(db, "planos/invalid-status"), {
    id: "invalid-status", nome: "Invalid", descricao: "", valor_centavos: 100,
    ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Desconhecido",
    criado_em: serverTimestamp(), atualizado_em: serverTimestamp(), ultima_operacao_id: operationId,
  });
  batch.set(doc(db, "auditoria_assinaturas", operationId), {
    acao: "plano_criado", plano_id: "invalid-status", operation_id: operationId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(),
    detalhes: { nome: "Invalid", valor_centavos: 100, ciclo: "Mensal" },
  });
  batch.set(doc(db, "assinatura_operacoes", operationId), {
    operation_id: operationId, actor_uid: "platform-admin", action: "savePlan",
    request_data: { action: "savePlan", planId: null, plan: { nome: "Invalid", descricao: "", valor_centavos: 100, ciclo: "Mensal", limite_usuarios: null, limite_filiais: null, status: "Desconhecido" } },
    target_id: "invalid-status", result: { planId: "invalid-status" }, processed_at: serverTimestamp(),
  });
  await assertFails(batch.commit());

  const transitionId = "op-invalid-transition";
  const invalidTransition = writeBatch(db);
  invalidTransition.update(doc(db, "empresas/empresa-a/assinaturas/atual"), {
    status: "Pendente", atualizado_em: serverTimestamp(), atualizado_por: "platform-admin", ultima_operacao_id: transitionId,
  });
  invalidTransition.set(doc(db, "empresas/empresa-a/historico_assinatura", transitionId), {
    acao: "plano_vinculado", empresa_id: "empresa-a", plano_id: "pro", operation_id: transitionId,
    ator_uid: "platform-admin", ator_nome: "Plataforma", ocorrido_em: serverTimestamp(), detalhes: { plano_nome: "Pro" },
  });
  invalidTransition.set(doc(db, "assinatura_operacoes", transitionId), {
    operation_id: transitionId, actor_uid: "platform-admin", action: "assignPlan",
    request_data: { action: "assignPlan", empresaId: "empresa-a", planId: "pro" }, target_id: "empresa-a",
    result: { ok: true }, processed_at: serverTimestamp(),
  });
  await assertFails(invalidTransition.commit());
  await assertFails(updateDoc(doc(db, "empresas/empresa-a/assinaturas/atual"), { status: "Unexpected" }));
});

test("company administrators and clients cannot cross tenant subscription or history boundaries", async () => {
  const companyA = environment.authenticatedContext("company-admin-a").firestore();
  await assertSucceeds(getDoc(doc(companyA, "empresas/empresa-a/assinaturas/atual")));
  await assertSucceeds(getDoc(doc(companyA, "empresas/empresa-a/historico_assinatura/evento-1")));
  await assertFails(getDoc(doc(companyA, "empresas/empresa-b/assinaturas/atual")));
  await assertFails(getDoc(doc(companyA, "empresas/empresa-b/historico_assinatura/evento-1")));
  await assertFails(setDoc(doc(companyA, "planos/empresa-plan"), { nome: "Plano indevido", valor_centavos: 1 }));
  await assertFails(updateDoc(doc(companyA, "empresas/empresa-a/assinaturas/atual"), { valor_centavos: 1 }));
  await assertFails(updateDoc(doc(companyA, "empresas/empresa-a/historico_assinatura/evento-1"), { acao: "alterado" }));
  await assertFails(setDoc(doc(companyA, "empresas/empresa-a/historico_assinatura/evento-2"), { acao: "falso" }));
  await assertFails(getDoc(doc(companyA, "planos/pro")));
  await assertFails(getDoc(doc(companyA, "assinatura_operacoes/op-1")));
  const client = environment.authenticatedContext("client-a").firestore();
  await assertFails(getDoc(doc(client, "empresas/empresa-a/assinaturas/atual")));
  await assertFails(getDoc(doc(client, "empresas/empresa-a/historico_assinatura/evento-1")));
});

test("inactive company administrators cannot read own subscription or history", async () => {
  const inactive = environment.authenticatedContext("company-admin-inactive").firestore();
  await assertFails(getDoc(doc(inactive, "empresas/empresa-a/assinaturas/atual")));
  await assertFails(getDoc(doc(inactive, "empresas/empresa-a/historico_assinatura/evento-1")));
  const missingStatus = environment.authenticatedContext("company-admin-no-status").firestore();
  await assertFails(getDoc(doc(missingStatus, "empresas/empresa-a/assinaturas/atual")));
  await assertFails(getDoc(doc(missingStatus, "empresas/empresa-a/historico_assinatura/evento-1")));
});
