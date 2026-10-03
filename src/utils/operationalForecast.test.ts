import test from "node:test";
import assert from "node:assert/strict";

import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";
import { getOperationalForecastSummary } from "./operationalForecast.ts";

const now = Date.now();

const supermercados: Supermercado[] = [
  {
    id: "super-1",
    empresa_id: "empresa-1",
    nome: "Loja Central",
    codigo: "LC",
    endereco: "Rua A",
    status: "Ativo",
    criado_em: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: "super-2",
    empresa_id: "empresa-1",
    nome: "Loja Norte",
    codigo: "LN",
    endereco: "Rua B",
    status: "Ativo",
    criado_em: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
  },
];

const chamados: Chamado[] = [
  {
    id: "c1",
    categoria: "operacional",
    empresa_id: "empresa-1",
    supermercado_id: "super-1",
    solicitante_nome: "Ana",
    setor: "Estoque",
    local_exato: "Setor 2",
    tipo_servico: "Reposição",
    numero_pedido: null,
    cliente: null,
    produto: "Papel",
    quantidade: "2",
    itens: [],
    total_solicitado: null,
    total_encontrado: null,
    percentual_atendido: null,
    motivo_incompleto: null,
    observacao_operador: null,
    atualizado_em: null,
    atualizado_por: null,
    local_separacao: null,
    prazo_limite: null,
    prioridade: "Urgente",
    observacoes: null,
    foto_nome: null,
    foto_data_url: null,
    empilhadeira_id: null,
    empilhadeira_identificacao: null,
    status: "Aguardando",
    operador_nome: null,
    criado_em: new Date(now - 1000 * 60 * 110).toISOString(),
    assumido_em: null,
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: null,
    finalizado_em: null,
    cancelado_em: null,
  },
  {
    id: "c2",
    categoria: "operacional",
    empresa_id: "empresa-1",
    supermercado_id: "super-1",
    solicitante_nome: "Bia",
    setor: "Recebimento",
    local_exato: null,
    tipo_servico: "Apoio interno",
    numero_pedido: null,
    cliente: null,
    produto: "Caixa",
    quantidade: "1",
    itens: [],
    total_solicitado: null,
    total_encontrado: null,
    percentual_atendido: null,
    motivo_incompleto: null,
    observacao_operador: null,
    atualizado_em: null,
    atualizado_por: null,
    local_separacao: null,
    prazo_limite: null,
    prioridade: "Normal",
    observacoes: null,
    foto_nome: null,
    foto_data_url: null,
    empilhadeira_id: null,
    empilhadeira_identificacao: null,
    status: "Em atendimento",
    operador_nome: "Carlos",
    criado_em: new Date(now - 1000 * 60 * 80).toISOString(),
    assumido_em: new Date(now - 1000 * 60 * 70).toISOString(),
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: new Date(now - 1000 * 60 * 60).toISOString(),
    finalizado_em: null,
    cancelado_em: null,
  },
  {
    id: "c3",
    categoria: "operacional",
    empresa_id: "empresa-1",
    supermercado_id: "super-2",
    solicitante_nome: "Davi",
    setor: "Expedição",
    local_exato: null,
    tipo_servico: "Movimentação",
    numero_pedido: null,
    cliente: null,
    produto: "Palete",
    quantidade: "3",
    itens: [],
    total_solicitado: null,
    total_encontrado: null,
    percentual_atendido: null,
    motivo_incompleto: null,
    observacao_operador: null,
    atualizado_em: null,
    atualizado_por: null,
    local_separacao: null,
    prazo_limite: null,
    prioridade: "Normal",
    observacoes: null,
    foto_nome: null,
    foto_data_url: null,
    empilhadeira_id: null,
    empilhadeira_identificacao: null,
    status: "Finalizado",
    operador_nome: "Elisa",
    criado_em: new Date(now - 1000 * 60 * 90).toISOString(),
    assumido_em: new Date(now - 1000 * 60 * 80).toISOString(),
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: new Date(now - 1000 * 60 * 70).toISOString(),
    finalizado_em: new Date(now - 1000 * 60 * 10).toISOString(),
    cancelado_em: null,
  },
];

test("getOperationalForecastSummary identifica risco alto na unidade com fila acumulada e recomanda redistribuição", () => {
  const summary = getOperationalForecastSummary(chamados, supermercados);

  assert.equal(summary.length, 2);
  assert.equal(summary[0].unitId, "super-1");
  assert.equal(summary[0].risk, "high");
  assert.equal(summary[0].openCalls, 2);
  assert.ok(summary[0].predictedQueueMinutes >= 80);
  assert.match(summary[0].recommendation, /redistrib|revisar|priorizar/i);
  assert.equal(summary[1].unitId, "super-2");
  assert.equal(summary[1].risk, "low");
});
