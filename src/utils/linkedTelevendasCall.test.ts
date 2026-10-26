import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chamado, ItemTelevendas } from "../types/chamado.ts";
import { buildLinkedPalletCallInput, submitLinkedPalletCall } from "./linkedTelevendasCall.ts";

const item: ItemTelevendas = {
  produto: "Arroz 5 kg",
  unidadeMedida: "Fardo",
  quantidadeSolicitada: 3,
  quantidadeEncontrada: 0,
  quantidadeFaltante: 3,
};

const pedido: Chamado = {
  id: "pedido-tv-1", categoria: "televendas", status: "Em separação",
  empresa_id: "empresa-1", supermercado_id: "unidade-1", solicitante_nome: "Vendas",
  setor: "Televendas", local_exato: "Separação A", tipo_servico: "Atendimento Televendas",
  numero_pedido: "PED-123", cliente: "Cliente A", produto: "Arroz 5 kg", quantidade: "3 fardos",
  itens: [item], total_solicitado: 3, total_encontrado: 0, percentual_atendido: 0,
  motivo_incompleto: null, observacao_operador: null, atualizado_em: null, atualizado_por: null,
  local_separacao: "Separação A", prazo_limite: "18:00", prioridade: "Normal",
  observacoes: null, foto_nome: null, foto_data_url: null, empilhadeira_id: null,
  empilhadeira_identificacao: null, operador_nome: "Separador", criado_em: "2026-10-01T10:00:00.000Z",
  assumido_em: null, a_caminho_em: null, cheguei_em: null, iniciado_em: null,
  finalizado_em: null, cancelado_em: null,
};

const request = {
  pedido,
  item,
  itemIndex: 0,
  quantidadeSolicitada: 2,
  solicitanteNome: "Separador A",
  localizacaoPallet: "Rua 4, módulo 2",
  tipoServico: "Movimentação" as const,
  observacoes: "Pallet próximo à coluna",
};

test("builds an operational request with an immutable link to the selected order item", () => {
  const original = structuredClone(pedido);
  const payload = buildLinkedPalletCallInput(request);

  assert.equal(payload.categoria, "operacional");
  assert.equal(payload.numero_pedido, "PED-123");
  assert.equal(payload.produto, "Arroz 5 kg");
  assert.equal(payload.quantidade, "2 fardos");
  assert.equal(payload.pedido_origem_id, pedido.id);
  assert.equal(payload.pedido_origem_item_index, 0);
  assert.equal(payload.pedido_origem_produto, item.produto);
  assert.equal(payload.localizacao_pallet, "Rua 4, módulo 2");
  assert.equal(payload.empresa_id, pedido.empresa_id);
  assert.equal(payload.supermercado_id, pedido.supermercado_id);
  assert.deepEqual(pedido, original);
});

test("rejects requests when the order is no longer in separation", () => {
  assert.throws(
    () => buildLinkedPalletCallInput({ ...request, pedido: { ...pedido, status: "Pronto" } }),
    /não está disponível/
  );
});

test("does not resolve as success when the Firestore creation callback fails", async () => {
  await assert.rejects(
    submitLinkedPalletCall(request, async () => {
      throw new Error("Falha de gravação");
    }),
    /Falha de gravação/
  );
});
