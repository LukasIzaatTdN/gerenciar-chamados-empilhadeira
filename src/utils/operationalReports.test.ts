import * as assert from "node:assert/strict";
import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";
import { getUnitSlaSummary } from "./operationalReports.ts";

const now = Date.now();
const makeChamado = (id: string, supermarketId: string, status: Chamado["status"], startedAt?: string, endedAt?: string, priority: Chamado["prioridade"] = "Normal"): Chamado => ({
  id,
  categoria: "operacional",
  empresa_id: "empresa-1",
  supermercado_id: supermarketId,
  solicitante_nome: "Maria",
  setor: "Estoque",
  local_exato: null,
  tipo_servico: "Reposição",
  numero_pedido: null,
  cliente: null,
  produto: "Produto A",
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
  prioridade: priority,
  observacoes: null,
  foto_nome: null,
  foto_data_url: null,
  empilhadeira_id: null,
  empilhadeira_identificacao: null,
  status,
  operador_nome: status === "Aguardando" ? null : "João",
  criado_em: new Date(now - 30 * 60 * 1000).toISOString(),
  assumido_em: status === "Aguardando" ? null : new Date(now - 25 * 60 * 1000).toISOString(),
  a_caminho_em: null,
  cheguei_em: null,
  iniciado_em: startedAt ?? null,
  finalizado_em: endedAt ?? null,
  cancelado_em: null,
});

const unidades: Supermercado[] = [
  { id: "loja-1", nome: "Loja 1", codigo: "L1", empresa_id: "empresa-1", status: "Ativo", endereco: "Rua A", criado_em: new Date(now - 1000 * 60 * 60).toISOString() },
  { id: "loja-2", nome: "Loja 2", codigo: "L2", empresa_id: "empresa-1", status: "Ativo", endereco: "Rua B", criado_em: new Date(now - 1000 * 60 * 60).toISOString() },
];

const chamados: Chamado[] = [
  makeChamado("1", "loja-1", "Finalizado", new Date(now - 3 * 60 * 1000).toISOString(), new Date(now - 1 * 60 * 1000).toISOString()),
  makeChamado("2", "loja-1", "Aguardando", undefined, undefined, "Urgente"),
  makeChamado("3", "loja-2", "Finalizado", new Date(now - 100 * 60 * 1000).toISOString(), new Date(now - 70 * 60 * 1000).toISOString()),
  makeChamado("4", "loja-2", "Finalizado", new Date(now - 7 * 60 * 1000).toISOString(), new Date(now - 2 * 60 * 1000).toISOString()),
];

const summary = getUnitSlaSummary(chamados, unidades);
assert.equal(summary[0].unitName, "Loja 1");
assert.equal(summary[0].urgentes, 1);
assert.equal(summary[1].unitName, "Loja 2");
assert.ok(summary[1].mediaAtendimento !== null);

console.log("operationalReports tests passed");
