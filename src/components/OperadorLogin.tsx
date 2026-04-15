import { useEffect, useMemo, useState } from "react";
import type { Empresa } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";
import type { PerfilAcesso, UsuarioSistema } from "../types/usuario";

interface OperadorLoginProps {
  onLogin: (usuario: UsuarioSistema) => void | Promise<void>;
  onFirebaseLogin?: (input: { email: string; password: string }) => void | Promise<void>;
  onFirebaseGoogleLogin?: () => void | Promise<void>;
  onFirebaseRegister?: (input: {
    nome: string;
    email: string;
    password: string;
    perfil: PerfilAcesso;
    empresa_id: string | null;
    supermercado_id: string | null;
  }) => void | Promise<void>;
  onCancel: () => void;
  empresas: Empresa[];
  supermercados: Supermercado[];
  authMode?: "local" | "firebase";
}

const PERFIS_LOGIN: PerfilAcesso[] = [
  "Promotor",
  "Funcionário",
  "Operador",
  "Supervisor",
  "Televendas",
  "Administrador da Empresa",
  "Administrador Geral",
];

const PERFIS_AUTO_CADASTRO: PerfilAcesso[] = [
  "Promotor",
  "Funcionário",
  "Operador",
  "Supervisor",
  "Televendas",
];

export default function OperadorLogin({
  onLogin,
  onFirebaseLogin,
  onFirebaseGoogleLogin,
  onFirebaseRegister,
  onCancel,
  empresas,
  supermercados,
  authMode = "local",
}: OperadorLoginProps) {
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [perfilSelecionado, setPerfilSelecionado] = useState<PerfilAcesso | "">("");
  const [nomeColaborador, setNomeColaborador] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [supermercadoId, setSupermercadoId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const empresasAtivas = useMemo(
    () => empresas.filter((item) => item.status === "Ativa"),
    [empresas]
  );
  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );
  const supermercadosDisponiveis = useMemo(
    () =>
      supermercadosAtivos.filter((item) => (empresaId ? item.empresa_id === empresaId : true)),
    [empresaId, supermercadosAtivos]
  );

  const isAdminGeral = perfilSelecionado === "Administrador Geral";
  const isAdminEmpresa = perfilSelecionado === "Administrador da Empresa";
  const perfisDisponiveisCadastro =
    authMode === "firebase" && authTab === "register"
      ? PERFIS_AUTO_CADASTRO
      : PERFIS_LOGIN;
  const precisaEmpresa = Boolean(perfilSelecionado) && !isAdminGeral;
  const precisaUnidade = Boolean(perfilSelecionado) && !isAdminGeral && !isAdminEmpresa;
  const shouldDisableSubmit =
    authMode === "firebase" && authTab === "register" && precisaEmpresa && empresasAtivas.length === 0;

  useEffect(() => {
    if (isAdminGeral) {
      setEmpresaId("");
      setSupermercadoId("");
      return;
    }

    if (perfilSelecionado && !empresaId) {
      setEmpresaId(empresasAtivas[0]?.id ?? "");
    }
  }, [perfilSelecionado, empresaId, empresasAtivas, isAdminGeral]);

  useEffect(() => {
    if (!precisaUnidade) {
      setSupermercadoId("");
      return;
    }

    if (!supermercadoId) {
      setSupermercadoId(supermercadosDisponiveis[0]?.id ?? "");
    }
  }, [precisaUnidade, supermercadoId, supermercadosDisponiveis]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (authMode === "firebase") {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) return setError("Informe seu e-mail");
      if (!password.trim()) return setError("Informe sua senha");

      if (authTab === "login") {
        if (!onFirebaseLogin) return setError("Fluxo de autenticação indisponível");

        try {
          await onFirebaseLogin({ email: normalizedEmail, password });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível entrar.");
        }
        return;
      }
    }

    const nomeFinal = nomeColaborador.trim();
    if (!nomeFinal) return setError("Informe o nome do colaborador");
    if (!perfilSelecionado) return setError("Selecione um perfil");
    if (precisaEmpresa && !empresaId) return setError("Selecione a empresa");
    if (precisaUnidade && !supermercadoId) return setError("Selecione a unidade");

    if (authMode === "firebase") {
      if (!onFirebaseRegister) return setError("Fluxo de cadastro indisponível");

      try {
        await onFirebaseRegister({
          nome: nomeFinal,
          email: email.trim(),
          password,
          perfil: perfilSelecionado,
          empresa_id: isAdminGeral ? null : empresaId,
          supermercado_id: precisaUnidade ? supermercadoId : null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
      }
      return;
    }

    const usuario: UsuarioSistema = {
      id: `session-${perfilSelecionado.toLowerCase().replace(/\s+/g, "-")}-${empresaId || "all"}-${supermercadoId || "all"}`,
      nome: nomeFinal,
      perfil: perfilSelecionado,
      empresa_id: isAdminGeral ? null : empresaId,
      supermercado_id: precisaUnidade ? supermercadoId : null,
      supermercado_ids: precisaUnidade && supermercadoId ? [supermercadoId] : [],
    };

    await onLogin(usuario);
  }

  function renderTenantSelectors() {
    if (!perfilSelecionado) return null;

    return (
      <>
        {isAdminGeral ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Administrador Geral usa visão consolidada de todas as empresas e unidades.
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Empresa</label>
            <select
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setSupermercadoId("");
                setError("");
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900"
            >
              <option value="">Selecione a empresa</option>
              {empresasAtivas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {precisaUnidade && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Unidade</label>
            <select
              value={supermercadoId}
              onChange={(e) => {
                setSupermercadoId(e.target.value);
                setError("");
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900"
            >
              <option value="">Selecione a unidade</option>
              {supermercadosDisponiveis.map((supermercado) => (
                <option key={supermercado.id} value={supermercado.id}>
                  {supermercado.nome} ({supermercado.codigo})
                </option>
              ))}
            </select>
          </div>
        )}

        {isAdminEmpresa && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            Administrador da Empresa terá visão de todas as unidades do cliente selecionado.
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-none bg-slate-100/90 px-4 py-4 backdrop-blur-md sm:items-center sm:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,61,117,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(249,115,22,0.08),transparent_28%)]" />
      <div className="relative my-auto flex w-full max-w-md animate-in flex-col overflow-hidden overscroll-contain rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.16)] sm:rounded-[32px] max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 flex items-center justify-end bg-white/95 px-5 pt-5 backdrop-blur-sm">
          <button onClick={onCancel} className="rounded-2xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
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
            Plataforma SaaS para operação em tempo real entre empresas, unidades e equipes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-8">
          {authMode === "firebase" && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button type="button" onClick={() => { setAuthTab("login"); setError(""); }} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${authTab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                Entrar
              </button>
              <button type="button" onClick={() => { setAuthTab("register"); setError(""); }} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${authTab === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                Criar conta
              </button>
            </div>
          )}

          {authMode === "firebase" && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="seuemail@empresa.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Senha</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Digite sua senha" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-base text-slate-900" />
                  <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute inset-y-0 right-0 px-4 text-sm text-slate-500">
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>
              {authTab === "login" && onFirebaseGoogleLogin && (
                <button type="button" onClick={() => { void onFirebaseGoogleLogin(); }} className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700">
                  Entrar com Google
                </button>
              )}
            </>
          )}

          {(authMode === "local" || authTab === "register") && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Nome do colaborador</label>
                <input type="text" value={nomeColaborador} onChange={(e) => { setNomeColaborador(e.target.value); setError(""); }} placeholder="Ex.: João Silva" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Perfil de acesso</label>
                <select value={perfilSelecionado} onChange={(e) => { setPerfilSelecionado(e.target.value as PerfilAcesso | ""); setError(""); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900">
                  <option value="">Selecione seu acesso</option>
                  {perfisDisponiveisCadastro.map((perfil) => (
                    <option key={perfil} value={perfil}>
                      {perfil}
                    </option>
                  ))}
                </select>
              </div>

              {renderTenantSelectors()}

              {perfilSelecionado && (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{nomeColaborador.trim() || "Nome não informado"}</p>
                  <p className="mt-1">Perfil: {perfilSelecionado}</p>
                  <p className="mt-1">
                    Empresa: {isAdminGeral ? "Todas as empresas" : empresasAtivas.find((item) => item.id === empresaId)?.nome ?? "Não definida"}
                  </p>
                  <p className="mt-1">
                    Unidade: {precisaUnidade ? supermercadosDisponiveis.find((item) => item.id === supermercadoId)?.nome ?? "Não definida" : "Todas as unidades vinculadas"}
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button type="submit" disabled={shouldDisableSubmit} className={`touch-target flex w-full items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-4 py-4 text-base font-bold text-white shadow-[0_18px_30px_rgba(15,23,42,0.22)] ${shouldDisableSubmit ? "cursor-not-allowed opacity-60" : "hover:brightness-105"}`}>
            {authMode === "firebase" && authTab === "register" ? "Criar Conta" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
