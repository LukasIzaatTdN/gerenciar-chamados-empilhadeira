import { useState } from "react";

interface OperadorLoginProps {
  onLogin: (nome: string) => void;
  onCancel: () => void;
}

export default function OperadorLogin({ onLogin, onCancel }: OperadorLoginProps) {
  const [nome, setNome] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setError("Informe seu nome para continuar");
      return;
    }
    onLogin(nome.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">👷</span>
            <h2 className="text-lg font-bold text-white">
              Acesso do Operador
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white/70">
              Nome do Operador *
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
                error ? "border-red-400/50 bg-red-500/10" : "border-white/10 bg-white/5"
              } px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/20`}
              autoFocus
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-400">{error}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/60 transition-all hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:from-indigo-400 hover:to-indigo-500 hover:shadow-xl active:scale-[0.98]"
            >
              👷 Entrar como Operador
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
