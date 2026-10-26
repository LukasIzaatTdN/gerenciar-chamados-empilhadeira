import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chamado } from "../types/chamado.ts";
import { getLinkedCallProgress, getLinkedCallsForItem } from "./televendasLinkedCalls.ts";

function linkedCall(overrides: Partial<Chamado> = {}): Chamado {
  return {
    id: "call-1", categoria: "operacional", pedido_origem_id: "pedido-1",
    pedido_origem_item_index: 0, pedido_origem_produto: "Produto A",
    localizacao_pallet: "Rua 1", empresa_id: "empresa-1", supermercado_id: "unidade-1",
    solicitante_nome: "Separador", setor: "Televendas", local_exato: "Rua 1",
    tipo_servico: "Movimentação", numero_pedido: "PED-1", cliente: null,
    produto: "Produto A", quantidade: "2 unidades", itens: [], total_solicitado: null,
    total_encontrado: null, percentual_atendido: null, motivo_incompleto: null,
    observacao_operador: null, atualizado_em: null, atualizado_por: null,
    local_separacao: null, prazo_limite: null, prioridade: "Normal", observacoes: null,
    foto_nome: null, foto_data_url: null, empilhadeira_id: null,
    empilhadeira_identificacao: null, status: "Aguardando", operador_nome: null,
    criado_em: "2026-10-01T10:00:00.000Z", assumido_em: null, a_caminho_em: null,
    cheguei_em: null, iniciado_em: null, finalizado_em: null, cancelado_em: null,
    ...overrides,
  };
}

test("associates multiple operational calls only with the matching order item", () => {
  const pedido = { id: "pedido-1", empresa_id: "empresa-1", supermercado_id: "unidade-1" };
  const calls = [
    linkedCall({ id: "call-1", pedido_origem_item_index: 0 }),
    linkedCall({ id: "call-2", pedido_origem_item_index: 0, tipo_servico: "Retirada" }),
    linkedCall({ id: "call-other-item", pedido_origem_item_index: 1 }),
    linkedCall({ id: "call-other-unit", supermercado_id: "unidade-2" }),
    linkedCall({ id: "call-unlinked", pedido_origem_id: null }),
  ];

  assert.deepEqual(
    getLinkedCallsForItem(calls, pedido, 0).map(({ id }) => id),
    ["call-1", "call-2"]
  );
});

test("shows the current real progress from status and lifecycle timestamps", () => {
  assert.equal(getLinkedCallProgress(linkedCall()), "Aguardando");
  assert.equal(getLinkedCallProgress(linkedCall({ operador_nome: "Operador A", assumido_em: "now" })), "Assumido");
  assert.equal(getLinkedCallProgress(linkedCall({ a_caminho_em: "now" })), "A caminho");
  assert.equal(getLinkedCallProgress(linkedCall({ cheguei_em: "now" })), "Cheguei");
  assert.equal(getLinkedCallProgress(linkedCall({ status: "Em atendimento", iniciado_em: "now" })), "Em atendimento");
  assert.equal(getLinkedCallProgress(linkedCall({ status: "Finalizado", finalizado_em: "now" })), "Finalizado");
  assert.equal(getLinkedCallProgress(linkedCall({ status: "Cancelado", cancelado_em: "now" })), "Cancelado");
});

test("a refreshed operational status does not change Televendas item quantities or order status", () => {
  const pedido = {
    status: "Em separação",
    itens: [{ produto: "Produto A", unidadeMedida: "Unidade" as const, quantidadeSolicitada: 4, quantidadeEncontrada: 1, quantidadeFaltante: 3 }],
  };
  const before = structuredClone(pedido);
  const progress = getLinkedCallProgress(linkedCall({ status: "Finalizado", finalizado_em: "now" }));

  assert.equal(progress, "Finalizado");
  assert.deepEqual(pedido, before);
});
