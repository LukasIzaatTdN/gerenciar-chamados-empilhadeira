import type { Empresa } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";
import type { UsuarioSistema } from "../types/usuario";
import AdminIcon from "./AdminIcon";

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
  const pendencias = semUnidades.length + semGestor.length;

  const indicadores = [
    { label: "Empresas ativas", value: ativas, hint: `de ${empresas.length.toLocaleString("pt-BR")} ${empresas.length === 1 ? "empresa cadastrada" : "empresas cadastradas"}`, icon: "company", tone: "positive" },
    { label: "Empresas inativas", value: empresas.length - ativas, hint: "Cadastros com status inativo", icon: "company", tone: "neutral" },
    { label: "Unidades ativas", value: unidades.filter((unidade) => unidade.status === "Ativo").length, hint: `de ${unidades.length.toLocaleString("pt-BR")} ${unidades.length === 1 ? "unidade cadastrada" : "unidades cadastradas"}`, icon: "units", tone: "primary" },
  ] as const;

  const areas = [
    { view: "empresas", title: "Empresas e unidades", description: "Organize clientes, unidades e responsáveis de cada empresa.", icon: "company" },
    { view: "usuarios", title: "Acessos", description: "Gerencie responsáveis convidados, perfis e vínculos.", icon: "users" },
    { view: "assinaturas", title: "Planos e assinaturas", description: "Consulte vigências, limites e o histórico comercial.", icon: "subscription" },
  ] as const;

  return (
    <main className="admin-overview">
      <header className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Gestão da plataforma</p>
          <h1>Visão geral</h1>
          <p>Acompanhe seus clientes e mantenha a estrutura da plataforma organizada.</p>
        </div>
        <div className="admin-heading-actions">
          <button type="button" onClick={onProfile} className="admin-button admin-button-secondary">
            <AdminIcon name="user" width={16} height={16} />Minha conta
          </button>
          <button type="button" onClick={() => onNavigate("empresas")} className="admin-button admin-button-primary">
            Gerenciar empresas<AdminIcon name="arrow" width={16} height={16} />
          </button>
        </div>
      </header>

      <section aria-label="Resumo da plataforma" className="platform-metrics">
        {indicadores.map(({ label, value, hint, icon, tone }) => (
          <article key={label} className={`platform-metric is-${tone}`}>
            <div className="platform-metric-heading">
              <h2>{label}</h2>
              <span className="platform-metric-icon"><AdminIcon name={icon} /></span>
            </div>
            <p className="platform-metric-value">{value.toLocaleString("pt-BR")}</p>
            <p className="platform-metric-hint">{hint}</p>
          </article>
        ))}
      </section>

      <div className="platform-overview-grid">
        <section className="platform-panel" aria-labelledby="platform-areas">
          <header className="platform-panel-heading">
            <p className="admin-eyebrow">Acesso rápido</p>
            <h2 id="platform-areas">Áreas de gestão</h2>
            <p>As principais rotinas administrativas em um só lugar.</p>
          </header>
          <div className="platform-area-list">
            {areas.map(({ view, title, description, icon }) => (
              <button key={view} type="button" onClick={() => onNavigate(view)} className="platform-area-link">
                <span className="platform-area-icon"><AdminIcon name={icon} width={22} height={22} /></span>
                <span className="platform-area-copy"><strong>{title}</strong><span>{description}</span></span>
                <AdminIcon name="arrow" className="platform-area-arrow" width={18} height={18} />
              </button>
            ))}
          </div>
        </section>

        <section className="platform-panel" aria-labelledby="platform-attention">
          <header className="platform-panel-heading">
            <p className="admin-eyebrow">Estrutura dos clientes</p>
            <h2 id="platform-attention">Pontos de atenção</h2>
            <p>Confira os cadastros das empresas ativas.</p>
          </header>
          {ativas === 0 ? (
            <div className="platform-attention-empty">
              <span className="platform-area-icon"><AdminIcon name="company" width={24} height={24} /></span>
              <h3>{empresas.length === 0 ? "Comece pela primeira empresa" : "Nenhuma empresa ativa"}</h3>
              <p>{empresas.length === 0 ? "Cadastre seus clientes para acompanhar unidades e responsáveis por aqui." : "Ative uma empresa para acompanhar as pendências do cadastro."}</p>
              <button type="button" onClick={() => onNavigate("empresas")} className="admin-button admin-button-secondary">
                Ir para Empresas<AdminIcon name="arrow" width={16} height={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="platform-attention-summary">
                <span className={`admin-status ${pendencias > 0 ? "is-warning" : "is-positive"}`}>
                  <span className="company-status-dot" aria-hidden="true" />
                  {pendencias === 0 ? "Sem pendências de cadastro" : `${pendencias.toLocaleString("pt-BR")} ${pendencias === 1 ? "ponto de atenção" : "pontos de atenção"}`}
                </span>
              </div>
              <ul className="platform-attention-list">
                {[
                  { title: "Sem unidade ativa", companies: semUnidades },
                  { title: "Sem responsável ativo", companies: semGestor },
                ].map(({ title, companies }) => (
                  <li key={title}>
                    <div className="platform-attention-row">
                      <h3>{title}</h3>
                      <span className={`platform-attention-count ${companies.length > 0 ? "has-pending" : ""}`}>
                        {companies.length.toLocaleString("pt-BR")} {companies.length === 1 ? "empresa" : "empresas"}
                      </span>
                    </div>
                    {companies.length > 0 ? (
                      <details className="platform-attention-details">
                        <summary aria-label={`Ver empresas ${title.toLocaleLowerCase("pt-BR")}`}>Ver empresas</summary>
                        <ul>{companies.map((empresa) => <li key={empresa.id}>{empresa.nome}</li>)}</ul>
                      </details>
                    ) : <p className="platform-attention-clear">Nenhuma pendência neste item.</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <footer className="platform-attention-footer">
            <AdminIcon name="subscription" width={18} height={18} />
            <p>Vigências e pendências comerciais ficam em <button type="button" onClick={() => onNavigate("assinaturas")}>Planos e assinaturas<AdminIcon name="arrow" width={13} height={13} /></button>.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
