import assert from "node:assert/strict";
import { test } from "node:test";
import { buildManualSeparationConfirmation, buildSeparationConfirmation, getSeparationConfirmationSummary, hasForkliftReceiptForItem } from "./separationConfirmation.ts";
import type { Chamado } from "../types/chamado";

const pedido: Chamado = {
  id: "pedido-a", categoria: "televendas", empresa_id: "empresa-a", supermercado_id: "unidade-a",
  solicitante_nome: "Separador", setor: "Televendas", local_exato: null, tipo_servico: "Atendimento Televendas",
  numero_pedido: "P-1", cliente: null, produto: "Arroz", quantidade: "10 Caixa",
  itens: [{ produto: "Arroz", unidadeMedida: "Caixa", quantidadeSolicitada: 10, quantidadeEncontrada: 4, quantidadeFaltante: 6 }],
  total_solicitado: 10, total_encontrado: 4, percentual_atendido: 40, motivo_incompleto: null, observacao_operador: null,
  atualizado_em: null, atualizado_por: null, local_separacao: null, prazo_limite: null, prioridade: "Normal", observacoes: null,
  foto_nome: null, foto_data_url: null, empilhadeira_id: null, empilhadeira_identificacao: null,
  status: "Em separação", operador_nome: null, criado_em: "2026-10-25T10:00:00.000Z", assumido_em: null,
  a_caminho_em: null, cheguei_em: null, iniciado_em: null, finalizado_em: null, cancelado_em: null,
};
const chamado: Chamado = {
  ...pedido, id: "call-a", categoria: "operacional", tipo_servico: "Movimentação", status: "Finalizado",
  pedido_origem_id: pedido.id, pedido_origem_item_index: 0, pedido_origem_produto: "Arroz", localizacao_pallet: "Pallet 4",
};

test("confirmation summary uses requested, existing separated, remaining and original unit", () => {
  assert.deepEqual(getSeparationConfirmationSummary(pedido, 0), { solicitada: 10, separada: 4, restante: 6, unidade: "Caixa" });
});
test("partial and zero confirmations are allowed only within remaining and zero requires a reason", () => {
  assert.equal(buildSeparationConfirmation({ pedido, chamado, itemIndex: 0, quantidade: 3, justificativa: "", actorUid: "u" }).itens[0].quantidadeEncontrada, 7);
  assert.equal(buildSeparationConfirmation({ pedido, chamado, itemIndex: 0, quantidade: 0, justificativa: "Não recebido", actorUid: "u" }).quantidade, 0);
  assert.throws(() => buildSeparationConfirmation({ pedido, chamado, itemIndex: 0, quantidade: 0, justificativa: "", actorUid: "u" }), /justificativa/);
  assert.throws(() => buildSeparationConfirmation({ pedido, chamado, itemIndex: 0, quantidade: 7, justificativa: "", actorUid: "u" }), /excede/);
});
test("confirmation rejects non-final, forged, cross-company and cross-unit calls", () => {
  assert.throws(() => buildSeparationConfirmation({ pedido, chamado: { ...chamado, status: "Em atendimento" }, itemIndex: 0, quantidade: 1, justificativa: "", actorUid: "u" }), /vinculado/);
  assert.throws(() => buildSeparationConfirmation({ pedido, chamado: { ...chamado, empresa_id: "empresa-b" }, itemIndex: 0, quantidade: 1, justificativa: "", actorUid: "u" }), /vinculado/);
  assert.throws(() => buildSeparationConfirmation({ pedido, chamado: { ...chamado, supermercado_id: "unidade-b" }, itemIndex: 0, quantidade: 1, justificativa: "", actorUid: "u" }), /vinculado/);
});
test("legacy Televendas item units and existing quantities remain compatible", () => {
  const old = { ...pedido, itens: [{ produto: "Feijão", unidadeMedida: "Fardo", quantidadeSolicitada: 3, quantidadeEncontrada: 1 }] };
  assert.equal(getSeparationConfirmationSummary(old, 0).unidade, "Fardo");
  assert.equal(getSeparationConfirmationSummary(old, 0).separada, 1);
});

test("manual confirmation can update a different item after a forklift receipt", () => {
  const mixed = {
    ...pedido,
    itens: [
      { produto: "Arroz", unidadeMedida: "Caixa" as const, quantidadeSolicitada: 10, quantidadeEncontrada: 4, quantidadeFaltante: 6 },
      { produto: "Feijão", unidadeMedida: "Fardo" as const, quantidadeSolicitada: 5, quantidadeEncontrada: 2, quantidadeFaltante: 3 },
    ],
    confirmacoes_empilhadeira: { "call-arroz": { item_index: 0, quantidade: 4, unidade_medida: "Caixa" as const } },
  };
  assert.equal(hasForkliftReceiptForItem(mixed, 0), true);
  assert.equal(hasForkliftReceiptForItem(mixed, 1), false);
  const confirmation = buildManualSeparationConfirmation(mixed, 1, 3);
  assert.equal(confirmation.quantidade, 1);
  assert.equal(confirmation.itens[0].quantidadeEncontrada, 4);
  assert.equal(confirmation.itens[1].quantidadeEncontrada, 3);
  assert.throws(() => buildManualSeparationConfirmation(mixed, 0, 5), /empilhadeira/);
  assert.throws(() => buildManualSeparationConfirmation(mixed, 1, 1), /reduzir/);
});
