import { useState } from "react";

export type PerfilAcesso = "Promotor" | "Funcionário" | "Operador" | "Supervisor";

interface OperadorLoginProps {
  onLogin: (nome: string, perfil: PerfilAcesso) => void;
  onCancel: () => void;
}

const PERFIS: PerfilAcesso[] = ["Promotor", "Funcionário", "Operador", "Supervisor"];

export default function OperadorLogin({ onLogin, onCancel }: OperadorLoginProps) {
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<PerfilAcesso>("Operador");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setError("Informe seu nome para continuar");
      return;
    }
    onLogin(nome.trim(), perfil);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100/90 p-4 backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.14),transparent_30%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.12),transparent_28%)]" />

      <div className="relative w-full max-w-md animate-in rounded-[32px] border border-slate-200/80 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-end px-5 pt-5">
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
          <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] text-3xl text-white shadow-[0_20px_40px_rgba(29,78,216,0.25)]">
            🏗️
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
            LogiCall Empilhadeira
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            App interno para organizar chamados de empilhadeira com agilidade entre patio, docas e estoque.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Nome
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setError("");
              }}
              placeholder="Ex: Carlos Santos"
              className={`w-full rounded-xl border ${
                error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
              } touch-target px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
              autoFocus
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500">{error}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Perfil de acesso
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PERFIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPerfil(item)}
                  className={`touch-target rounded-2xl border px-3 py-3 text-sm font-semibold transition-all ${
                    perfil === item
                      ? "border-blue-900 bg-blue-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="touch-target flex w-full items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-4 text-base font-bold text-white shadow-[0_18px_30px_rgba(15,23,42,0.22)] transition-all hover:brightness-105 active:scale-[0.99]"
          >
            Entrar
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              Acesso interno rápido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
