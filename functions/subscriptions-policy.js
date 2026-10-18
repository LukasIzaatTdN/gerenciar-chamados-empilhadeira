const PLAN_CYCLES = new Set(["Mensal", "Trimestral", "Semestral", "Anual"]);
const SUBSCRIPTION_STATUSES = new Set(["Pendente", "Ativa", "Expirada", "Suspensa", "Cancelada"]);

function assertPlatformAdmin(user) {
  if (!user || user.perfil !== "Administrador Geral" || user.status !== "Ativo") {
    const error = new Error("Apenas Administrador da Plataforma pode gerenciar assinaturas.");
    error.code = "permission-denied";
    throw error;
  }
}

function validatePlan(input) {
  if (!input || typeof input !== "object") throw invalid("Plano inválido.");
  const nome = typeof input.nome === "string" ? input.nome.trim() : "";
  if (nome.length < 2 || nome.length > 80) throw invalid("Informe um nome de plano válido.");
  if (!Number.isSafeInteger(input.valor_centavos) || input.valor_centavos < 0) {
    throw invalid("O valor deve ser informado em centavos inteiros e não negativos.");
  }
  if (!PLAN_CYCLES.has(input.ciclo)) throw invalid("Ciclo comercial inválido.");
  for (const key of ["limite_usuarios", "limite_filiais"]) {
    if (input[key] !== null && (!Number.isSafeInteger(input[key]) || input[key] < 1)) {
      throw invalid(`Limite inválido: ${key}.`);
    }
  }
  return {
    nome,
    descricao: typeof input.descricao === "string" ? input.descricao.trim().slice(0, 500) : "",
    valor_centavos: input.valor_centavos,
    ciclo: input.ciclo,
    limite_usuarios: input.limite_usuarios ?? null,
    limite_filiais: input.limite_filiais ?? null,
    status: input.status === "Ativo" || input.status === "Inativo"
      ? input.status
      : (() => { throw invalid("Status de plano inválido."); })(),
  };
}

function assertSubscriptionTransition(action, currentStatus) {
  if (currentStatus !== null && !SUBSCRIPTION_STATUSES.has(currentStatus)) {
    throw failed(`Status de assinatura desconhecido: ${currentStatus}.`);
  }
  if (action === "assignPlan") {
    if (currentStatus === null) return "Pendente";
    if (["Pendente", "Ativa", "Expirada"].includes(currentStatus)) return currentStatus;
  }
  if (action === "activate" && currentStatus === "Pendente") return "Ativa";
  if (action === "renew" && ["Ativa", "Expirada"].includes(currentStatus)) return "Ativa";
  throw failed(`Transição não permitida: ${currentStatus || "Sem assinatura"} / ${action}.`);
}

function invalid(message) {
  const error = new Error(message);
  error.code = "invalid-argument";
  return error;
}

function failed(message) {
  const error = new Error(message);
  error.code = "failed-precondition";
  throw error;
}

function addCycle(date, cycle) {
  const months = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 }[cycle];
  if (!months) throw invalid("Ciclo comercial inválido.");
  const result = new Date(date);
  if (!Number.isFinite(result.getTime())) throw failed("Data base da assinatura inválida.");
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

module.exports = { assertPlatformAdmin, assertSubscriptionTransition, validatePlan, addCycle };
