import { useEffect, useMemo, useState } from "react";
import type { Supermercado } from "../types/supermercado";
import type { PerfilAcesso, UsuarioSistema } from "../types/usuario";

interface OperadorLoginProps {
  onLogin: (usuario: UsuarioSistema) => void | Promise<void>;
  onFirebaseLogin?: (input: { email: string; password: string }) => void | Promise<void>;
  onFirebaseRegister?: (input: {
    nome: string;
    email: string;
    password: string;
    perfil: PerfilAcesso;
    supermercado_id: string;
  }) => void | Promise<void>;
  onCancel: () => void;
  supermercados: Supermercado[];
  authMode?: "local" | "firebase";
}

const PERFIS_LOGIN: PerfilAcesso[] = [
  "Promotor",
  "Funcionário",
  "Operador",
  "Administrador Geral",
];

export default function OperadorLogin({
  onLogin,
  onFirebaseLogin,
  onFirebaseRegister,
  onCancel,
  supermercados,
  authMode = "local",
}: OperadorLoginProps) {
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [perfilSelecionado, setPerfilSelecionado] = useState<PerfilAcesso | "">("");
  const [nomeColaborador, setNomeColaborador] = useState("");
  const [supermercadoId, setSupermercadoId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );

  useEffect(() => {
    if (perfilSelecionado && !supermercadoId) {
      setSupermercadoId(supermercadosAtivos[0]?.id ?? "");
    }
  }, [perfilSelecionado, supermercadoId, supermercadosAtivos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (authMode === "firebase") {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        setError("Informe seu e-mail");
        return;
      }
      if (!password.trim()) {
        setError("Informe sua senha");
        return;
      }

      if (authTab === "login") {
        if (!onFirebaseLogin) {
          setError("Fluxo de autenticação indisponível");
          return;
        }

        try {
          await onFirebaseLogin({
            email: normalizedEmail,
            password,
          });
        } catch {
          setError("Não foi possível entrar. Verifique e-mail e senha.");
        }
        return;
      }

      const nomeFinal = nomeColaborador.trim();
      if (!nomeFinal) {
        setError("Informe o nome do colaborador para criar a conta");
        return;
      }
      if (!perfilSelecionado) {
        setError("Selecione um perfil para criar a conta");
        return;
      }
      if (!supermercadoId) {
        setError("Selecione a unidade para criar a conta");
        return;
      }
      if (!onFirebaseRegister) {
        setError("Fluxo de cadastro indisponível");
        return;
      }

      try {
        await onFirebaseRegister({
          nome: nomeFinal,
          email: normalizedEmail,
          password,
          perfil: perfilSelecionado,
          supermercado_id: supermercadoId,
        });
      } catch {
        setError("Não foi possível criar a conta. Tente novamente.");
      }
      return;
    }

    const nomeFinal = nomeColaborador.trim();

    if (!nomeFinal) {
      setError("Informe o nome do colaborador para continuar");
      return;
    }

    if (!perfilSelecionado) {
      setError("Selecione um perfil para continuar");
      return;
    }

    if (!supermercadoId) {
      setError("Selecione uma unidade para continuar");
      return;
    }

    const usuario: UsuarioSistema = {
      id: `session-${perfilSelecionado.toLowerCase().replace(/\s+/g, "-")}-${supermercadoId || "all"}`,
      nome: nomeFinal,
      perfil: perfilSelecionado,
      supermercado_id: supermercadoId,
    };

    await onLogin(usuario);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-100/90 px-4 py-4 backdrop-blur-md sm:items-center sm:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,61,117,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(249,115,22,0.08),transparent_28%)]" />

      <div className="relative my-auto w-full max-w-md animate-in overflow-y-auto rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.16)] sm:rounded-[32px] max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 flex items-center justify-end bg-white/95 px-5 pt-5 backdrop-blur-sm">
          <button
            onClick={onCancel}
            className="rounded-2xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-2 text-center sm:px-8">
            <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-3xl text-white shadow-[0_20px_40px_rgba(15,23,42,0.22)]">
            🏗️
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
            LogiCall Empilhadeira
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            App interno para organizar chamados de empilhadeira com agilidade entre patio, docas e estoque.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-8">
          {authMode === "firebase" ? (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("login");
                    setError("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    authTab === "login"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("register");
                    setError("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    authTab === "register"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder="seuemail@empresa.com"
                  required
                  autoFocus
                  className={`w-full rounded-xl border ${
                    error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                  } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="••••••••"
                  required
                  className={`w-full rounded-xl border ${
                    error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                  } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                />
              </div>

              {authTab === "register" && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Nome do colaborador
                    </label>
                    <input
                      type="text"
                      value={nomeColaborador}
                      onChange={(e) => {
                        setNomeColaborador(e.target.value);
                        setError("");
                      }}
                      placeholder="Ex.: João Silva"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Perfil de acesso
                    </label>
                    <select
                      value={perfilSelecionado}
                      onChange={(e) => {
                        setPerfilSelecionado(e.target.value as PerfilAcesso | "");
                        setError("");
                      }}
                      className={`w-full rounded-xl border ${
                        error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                      } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                    >
                      <option value="">Selecione seu acesso</option>
                      {PERFIS_LOGIN.map((perfil) => (
                        <option key={perfil} value={perfil}>
                          {perfil}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Supermercado / Unidade
                    </label>
                    <select
                      value={supermercadoId}
                      onChange={(e) => {
                        setSupermercadoId(e.target.value);
                        setError("");
                      }}
                      className={`w-full rounded-xl border ${
                        error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                      } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                    >
                      <option value="">Selecione a unidade</option>
                      {supermercadosAtivos.map((supermercado) => (
                        <option key={supermercado.id} value={supermercado.id}>
                          {supermercado.nome} ({supermercado.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Perfil de acesso
                </label>
                <select
                  value={perfilSelecionado}
                  onChange={(e) => {
                    setPerfilSelecionado(e.target.value as PerfilAcesso | "");
                    setError("");
                  }}
                  className={`w-full rounded-xl border ${
                    error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                  } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                  autoFocus
                >
                  <option value="">Selecione seu acesso</option>
                  {PERFIS_LOGIN.map((perfil) => (
                    <option key={perfil} value={perfil}>
                      {perfil}
                    </option>
                  ))}
                </select>
                {error && (
                  <p className="mt-1.5 text-xs text-red-500">{error}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome do colaborador
                </label>
                <input
                  type="text"
                  value={nomeColaborador}
                  onChange={(e) => {
                    setNomeColaborador(e.target.value);
                    setError("");
                  }}
                  placeholder="Ex.: João Silva"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {perfilSelecionado && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Unidade
                  </label>
                  <select
                    value={supermercadoId}
                    onChange={(e) => {
                      setSupermercadoId(e.target.value);
                      setError("");
                    }}
                    className={`w-full rounded-xl border ${
                      error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                    } touch-target px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
                  >
                    <option value="">Selecione a unidade</option>
                    {supermercadosAtivos.map((supermercado) => (
                      <option key={supermercado.id} value={supermercado.id}>
                        {supermercado.nome} ({supermercado.codigo})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {perfilSelecionado && (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">
                    {nomeColaborador.trim() || "Nome não informado"}
                  </p>
                  <p className="mt-1">Perfil: {perfilSelecionado}</p>
                  <p className="mt-1">
                    Unidade: {supermercadosAtivos.find((item) => item.id === supermercadoId)?.nome ?? "Não definida"}
                  </p>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="touch-target flex w-full items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-4 py-4 text-base font-bold text-white shadow-[0_18px_30px_rgba(15,23,42,0.22)] transition-all hover:brightness-105 active:scale-[0.99]"
          >
            {authMode === "firebase" && authTab === "register" ? "Criar Conta" : "Entrar"}
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              {authMode === "firebase"
                ? "Acesso via Firebase Auth (e-mail e senha)"
                : "Acesso interno por perfil do sistema"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
