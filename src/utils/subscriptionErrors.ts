export function explainSubscriptionError(error: unknown) {
  const callableError = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof callableError?.code === "string" ? callableError.code : "";
  const message = typeof callableError?.message === "string" ? callableError.message : "";
  const details = typeof callableError?.details === "string" ? callableError.details : "";
  const diagnostic = [code, details, message].filter(Boolean).join(" — ");

  switch (code) {
    case "permission-denied":
    case "firestore/permission-denied":
      return `O Firestore recusou a operação. Confirme que a conta está ativa como Administrador Geral e que as regras SaaS correspondem a esta versão do sistema. ${diagnostic}`.trim();
    case "unauthenticated":
    case "firestore/unauthenticated":
      return `Sua sessão Firebase não está autenticada. Entre novamente. ${diagnostic}`.trim();
    case "invalid-argument":
    case "firestore/invalid-argument":
      return message || diagnostic || "Confira os campos informados.";
    case "failed-precondition":
    case "firestore/failed-precondition":
      return message || diagnostic || "A operação não é permitida no estado atual da assinatura.";
    case "unavailable":
    case "firestore/unavailable":
      return `O Firestore está indisponível. Confirme a conexão e o ambiente Firebase selecionado. ${diagnostic}`.trim();
    case "not-found":
    case "firestore/not-found":
      return message || diagnostic || "Não foi possível localizar a empresa ou o plano informado.";
    case "functions/not-found":
      return `A função manageSubscription não foi encontrada em us-central1. Confira o projeto selecionado e se o backend está implantado ou se o emulador está ativo. ${diagnostic}`.trim();
    case "functions/unauthenticated":
      return `Sua sessão Firebase não está autenticada. Entre novamente. ${diagnostic}`.trim();
    case "functions/permission-denied":
      return `Apenas um Administrador Geral ativo pode gerenciar planos e assinaturas. ${diagnostic}`.trim();
    case "functions/invalid-argument":
    case "functions/failed-precondition":
      return message || diagnostic || "Os dados enviados não atendem aos requisitos do backend.";
    case "functions/unavailable":
      return `O endpoint Firebase está indisponível. Confirme a conexão e se o ambiente (remoto ou emulador) está ativo. ${diagnostic}`.trim();
    case "functions/internal":
      return `A função manageSubscription em us-central1 retornou erro interno. Consulte os logs da função para o detalhe; diagnóstico recebido: ${diagnostic || "sem detalhes"}.`;
    default:
      return diagnostic || "Não foi possível concluir a operação SaaS. Confira o console do navegador e os logs do backend.";
  }
}
