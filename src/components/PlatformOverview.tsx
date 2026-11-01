import type { Empresa } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";
import type { UsuarioSistema } from "../types/usuario";

type Props = {
  empresas: Empresa[];
  unidades: Supermercado[];
  usuarios: UsuarioSistema[];
  onNavigate: (view: "empresas" | "usuarios" | "assinaturas") => void;
  onProfile: () => void;
};

export default function PlatformOverview({ empresas, unidades, usuarios, onNavigate, onProfile }: Props) {
  const ativas = empresas.filter((empresa) => empresa.status === "Ativa").length;
  const semUnidades = empresas.filter((empresa) => empresa.status === "Ativa" && !unidades.some((unidade) => unidade.empresa_id === empresa.id && unidade.status === "Ativo"));
  const semGestor = empresas.filter((empresa) => empresa.status === "Ativa" && !usuarios.some((usuario) => usuario.empresa_id === empresa.id && usuario.status === "Ativo" && (usuario.perfil === "Gerente da Empresa" || usuario.perfil === "Administrador da Empresa")));
  return (
    <main className="app-main space-y-6 px-4 py-6 sm:px-6">
      <header className="professional-panel p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Gestão da plataforma</p>
        <h1 className="mt-2 text-3xl font-black">Administração geral</h1>
        <p className="mt-3 text-sm text-slate-500">Gerencie empresas clientes, organize os acessos e acompanhe os contratos da plataforma.</p>
        <button type="button" onClick={onProfile} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Minha conta</button>
      </header>
      <section aria-label="Resumo da plataforma" className="grid gap-4 sm:grid-cols-3">
        {[ ["Empresas ativas", ativas], ["Empresas inativas", empresas.length - ativas], ["Unidades ativas", unidades.filter((unidade) => unidade.status === "Ativo").length] ].map(([label, value]) => (
          <div key={label} className="professional-panel p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>
        ))}
      </section>
      <section aria-label="Áreas administrativas" className="grid gap-4 lg:grid-cols-3">
        {([
          ["empresas", "Empresas e unidades", "Cadastre clientes e acesse as unidades e os responsáveis de cada empresa."],
          ["usuarios", "Acessos", "Gerencie os responsáveis convidados, seus perfis e vínculos."],
          ["assinaturas", "Planos e assinaturas", "Consulte as assinaturas oficiais, vigências, limites e histórico comercial."],
        ] as const).map(([view, title, description]) => (
          <button key={view} type="button" onClick={() => onNavigate(view)} className="professional-panel p-6 text-left transition-colors hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <h2 className="text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p><span className="mt-4 inline-block text-sm font-bold text-blue-600">Abrir →</span>
          </button>
        ))}
      </section>
      <section className="professional-panel p-6" aria-labelledby="platform-attention">
        <h2 id="platform-attention" className="text-lg font-bold">Pontos de atenção nos cadastros</h2>
        <p className="mt-2 text-sm text-slate-500">Situação dos cadastros carregados. Consulte vigências e pendências comerciais em Planos e assinaturas.</p>
        <ul className="mt-4 space-y-3 text-sm">
          <li>{semUnidades.length} empresa(s) ativa(s) sem unidade ativa{semUnidades.length > 0 ? `: ${semUnidades.map((empresa) => empresa.nome).join(", ")}` : "."}</li>
          <li>{semGestor.length} empresa(s) ativa(s) sem responsável ativo{semGestor.length > 0 ? `: ${semGestor.map((empresa) => empresa.nome).join(", ")}` : "."}</li>
        </ul>
      </section>
    </main>
  );
}
