export function normalizeGovernanceMessage(
  error: unknown,
  fallback = "Não foi possível concluir esta operação."
): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = rawMessage.trim();
  if (!normalized) return fallback;

  const knownPatterns: Array<[RegExp, string]> = [
    [/auth\/user-not-found|usuário não encontrado|nenhuma conta encontrada/i, "Nenhuma conta encontrada com este e-mail. Verifique o cadastro ou crie uma conta."],
    [/auth\/wrong-password|senha incorreta|e-mail ou senha incorretos/i, "E-mail ou senha incorretos. Verifique os dados de acesso."],
    [/auth\/email-already-in-use|já está cadastrado|already in use/i, "Este e-mail já está cadastrado. Use outro e-mail ou faça login."],
    [/auth\/weak-password|senha precisa/i, "A senha precisa ser mais forte para continuar."],
    [/auth\/invalid-email|e-mail informado não é válido|invalid email/i, "O e-mail informado não é válido."],
    [/conta inativa|account.*inativa|status.*inativo/i, "Sua conta está inativa. Solicite ativação ao administrador."],
    [/perfil de acesso não configurado|perfil.*configur|perfil não configurado/i, "Perfil de acesso não configurado para esta conta. Solicite liberação ao administrador."],
    [/convite inválido|convite expirou|token de convite|invite.*invalid/i, "O convite informado é inválido, expirou ou já foi utilizado."],
    [/sem permissão|não possui autorização|autorização para esta ação|sem autorização/i, "Você não tem permissão para esta ação."],
    [/empresa do administrador não vinculada|empresa.*não vinculada|revise o cadastro do usuário/i, "Empresa do administrador não vinculada. Revise o cadastro do usuário."],
    [/sessão expirada|faça login novamente|session expired/i, "Sessão expirada. Faça login novamente."],
    [/empresa ou unidade não definida|empresa.*unidade.*definida|selecione a empresa|selecione a unidade/i, "Empresa ou unidade não definida. Revise o escopo do usuário antes de continuar."],
  ];

  for (const [pattern, userMessage] of knownPatterns) {
    if (pattern.test(normalized)) {
      return userMessage;
    }
  }

  return normalized;
}
