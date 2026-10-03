import * as assert from "node:assert/strict";
import type { Chamado } from "../types/chamado";
import { getOperationalAlerts } from "./operationalAlerts.ts";

const now = Date.now();
const makeChamado = (overrides: Partial<Chamado> = {}): Chamado => ({
  id: overrides.id ?? "c-1",
  categoria: "operacional",
  empresa_id: "empresa-1",
  supermercado_id: "loja-1",
  solicitante_nome: overrides.solicitante_nome ?? "Maria",
  setor: overrides.setor ?? "Estoque",
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
  prioridade: "Normal",
  observacoes: null,
  foto_nome: null,
  foto_data_url: null,
  empilhadeira_id: null,
  empilhadeira_identificacao: null,
  status: "Aguardando",
  operador_nome: null,
  criado_em: new Date(now - 1000 * 60 * 30).toISOString(),
  assumido_em: null,
  a_caminho_em: null,
  cheguei_em: null,
  iniciado_em: null,
  finalizado_em: null,
  cancelado_em: null,
  ...overrides,
});

const alerts = getOperationalAlerts([
  makeChamado({
    id: "v-1",
    prioridade: "Urgente",
    status: "Aguardando",
    setor: "Doca",
    criado_em: new Date(now - 1000 * 60 * 45).toISOString(),
  }),
  makeChamado({
    id: "s-1",
    prioridade: "Normal",
    status: "Em atendimento",
    setor: "Estoque",
    iniciado_em: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    operador_nome: "João",
  }),
  makeChamado({
    id: "s-2",
    prioridade: "Normal",
    status: "Aguardando",
    setor: "Patio",
    criado_em: new Date(now - 1000 * 60 * 90).toISOString(),
  }),
]);

assert.ok(alerts.some((item) => item.type === "urgente"));
assert.ok(alerts.some((item) => item.type === "atrasado"));
assert.ok(alerts.some((item) => item.type === "pendente"));
assert.equal(alerts[0].severity, "high");

console.log("operationalAlerts tests passed");
