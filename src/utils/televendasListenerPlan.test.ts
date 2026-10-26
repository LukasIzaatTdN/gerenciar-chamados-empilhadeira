import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chamado } from "../types/chamado.ts";
import {
  buildTelevendasLinkedListenerPlan,
  createListenerCallbackLease,
  diffTelevendasLinkedListenerPlan,
  estimateTelevendasListenerCount,
  TELEVENDAS_LINKED_ORDER_IDS_LIMIT,
} from "./televendasListenerPlan.ts";

function pedido(id: number, overrides: Partial<Chamado> = {}): Chamado {
  return {
    id: `pedido-${String(id).padStart(3, "0")}`,
    categoria: "televendas",
    tipo_servico: "Atendimento Televendas",
    status: "Em separação",
    ...overrides,
  } as Chamado;
}

for (const count of [1, 29, 30, 31, 60, 61, 100]) {
  test(`plano de listeners cobre ${count} pedidos sem exceder 30 IDs por consulta`, () => {
    const plan = buildTelevendasLinkedListenerPlan(Array.from({ length: count }, (_, index) => pedido(index)));
    const ids = plan.flatMap(({ pedidoIds }) => pedidoIds);

    assert.equal(plan.length, Math.ceil(count / TELEVENDAS_LINKED_ORDER_IDS_LIMIT));
    assert.equal(estimateTelevendasListenerCount(count), 2 + plan.length);
    assert.ok(plan.every(({ pedidoIds }) => pedidoIds.length > 0 && pedidoIds.length <= TELEVENDAS_LINKED_ORDER_IDS_LIMIT));
    assert.equal(new Set(ids).size, count);
    assert.deepEqual(ids, Array.from({ length: count }, (_, index) => pedido(index).id));
  });
}

test("deduplica pedido atual e legado e ignora chamados sem categoria Televendas", () => {
  const current = pedido(1);
  const legacy = pedido(1, { categoria: "operacional" as Chamado["categoria"], tipo_servico: "Atendimento Televendas" });
  const operational = pedido(2, { categoria: "operacional", tipo_servico: "Movimentação" });

  assert.deepEqual(buildTelevendasLinkedListenerPlan([current, legacy, operational]).flatMap(({ pedidoIds }) => pedidoIds), [current.id]);
});

test("mudanças de status não removem pedidos do plano; inclusão e remoção atualizam somente IDs planejados", () => {
  const statuses: Chamado["status"][] = ["Aberto", "Em separação", "Pronto", "Incompleto", "Cancelado"];
  for (const status of statuses) {
    assert.deepEqual(buildTelevendasLinkedListenerPlan([pedido(1, { status })]).flatMap(({ pedidoIds }) => pedidoIds), [pedido(1).id]);
  }

  const before = buildTelevendasLinkedListenerPlan([pedido(1), pedido(2)]);
  const afterAdd = buildTelevendasLinkedListenerPlan([pedido(1), pedido(2), pedido(3)]);
  const afterRemove = buildTelevendasLinkedListenerPlan([pedido(2), pedido(3)]);
  assert.equal(before.flatMap(({ pedidoIds }) => pedidoIds).length, 2);
  assert.equal(afterAdd.flatMap(({ pedidoIds }) => pedidoIds).length, 3);
  assert.equal(afterRemove.flatMap(({ pedidoIds }) => pedidoIds).length, 2);
});

test("mantém listener de bloco inalterado e adiciona ou remove apenas blocos afetados", () => {
  const pedidos30 = Array.from({ length: 30 }, (_, index) => pedido(index));
  const plano30 = buildTelevendasLinkedListenerPlan(pedidos30);
  const plano31 = buildTelevendasLinkedListenerPlan([...pedidos30, pedido(30)]);
  const diffAdd = diffTelevendasLinkedListenerPlan(plano30.map(({ key }) => key), plano31);

  assert.deepEqual(diffAdd.removedKeys, []);
  assert.equal(diffAdd.addedChunks.length, 1);
  assert.equal(diffAdd.addedChunks[0].pedidoIds.length, 1);

  const plano29 = buildTelevendasLinkedListenerPlan(pedidos30.slice(0, 29));
  const diffRemove = diffTelevendasLinkedListenerPlan(plano30.map(({ key }) => key), plano29);
  assert.equal(diffRemove.removedKeys.length, 1);
  assert.equal(diffRemove.addedChunks.length, 1);
  assert.equal(diffRemove.addedChunks[0].pedidoIds.length, 29);
});

test("callback cancelado não pode publicar snapshot tardio, mas o lease novo permanece ativo", () => {
  const oldSubscription = createListenerCallbackLease();
  const newSubscription = createListenerCallbackLease();

  oldSubscription.revoke();
  assert.equal(oldSubscription.isActive(), false);
  assert.equal(newSubscription.isActive(), true);
  newSubscription.revoke();
  assert.equal(newSubscription.isActive(), false);
});
