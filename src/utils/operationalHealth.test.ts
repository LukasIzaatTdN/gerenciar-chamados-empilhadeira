import test from "node:test";
import assert from "node:assert/strict";

import { getOperationalHealthSummary } from "./operationalHealth.ts";
import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

const now = Date.now();

const supermercados: Supermercado[] = [
  {
    id: "super-1",
    empresa_id: "empresa-1",
    nome: "Loja Central",
    codigo: "LC",
    endereco: "Rua A",
    status: "Ativo",
    criado_em: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "super-2",
    empresa_id: "empresa-1",
    nome: "Loja Norte",
    codigo: "LN",
    endereco: "Rua B",
    status: "Ativo",
    criado_em: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
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
    status: "Em atendimento",
    operador_nome: "Bruno",
    criado_em: new Date(now - 1000 * 60 * 150).toISOString(),
    assumido_em: new Date(now - 1000 * 60 * 120).toISOString(),
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: new Date(now - 1000 * 60 * 100).toISOString(),
    finalizado_em: null,
    cancelado_em: null,
  },
  {
    id: "c2",
    categoria: "operacional",
    empresa_id: "empresa-1",
    supermercado_id: "super-1",
    solicitante_nome: "Cleo",
    setor: "Recebimento",
    local_exato: "Dock",
    tipo_servico: "Descarga",
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
    status: "Aguardando",
    operador_nome: null,
    criado_em: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    assumido_em: null,
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: null,
    finalizado_em: null,
    cancelado_em: null,
  },
  {
    id: "c3",
    categoria: "operacional",
    empresa_id: "empresa-1",
    supermercado_id: "super-2",
    solicitante_nome: "Diego",
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
    criado_em: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
    assumido_em: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
    a_caminho_em: null,
    cheguei_em: null,
    iniciado_em: new Date(now - 1000 * 60 * 140).toISOString(),
    finalizado_em: new Date(now - 1000 * 60 * 30).toISOString(),
    cancelado_em: null,
  },
];

test("getOperationalHealthSummary classifica a unidade crítica e a saudável com score coerente", () => {
  const summary = getOperationalHealthSummary(chamados, supermercados);

  assert.equal(summary.length, 2);
  assert.equal(summary[0].unitId, "super-1");
  assert.equal(summary[0].status, "critical");
  assert.equal(summary[0].urgentes, 1);
  assert.equal(summary[0].emAtraso, 1);
  assert.ok(summary[0].score < 65);
  assert.equal(summary[1].unitId, "super-2");
  assert.ok(summary[1].score >= 80);
});
