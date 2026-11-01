import AdminIcon from "./AdminIcon";
import PageHeading from "./PageHeading";
import type { PerfilAcesso } from "../types/usuario";
import type { Supermercado } from "../types/supermercado";

type ThemeMode = "light" | "dark";

interface ProfileSettingsProps {
  nome: string;
  perfil: PerfilAcesso;
  supermercadoId: string | null;
  supermercadoNome: string | null;
  supermercados: Supermercado[];
  setorPrincipal: string;
  notificacoesAtivas: boolean;
  somAtivo: boolean;
  pushAtivo: boolean;
  pushMessage: string;
  tema: ThemeMode;
  onSupermercadoChange: (supermercadoId: string) => void | Promise<void>;
  onSetorPrincipalChange: (setor: string) => void;
  onNotificacoesChange: (enabled: boolean) => void;
  onSomChange: (enabled: boolean) => void;
  onPushEnable: () => void | Promise<void>;
  onPushDisable: () => void | Promise<void>;
  onTemaChange: (theme: ThemeMode) => void;
  onVoltar: () => void;
  backLabel?: string;
  showManageUnidadesAction?: boolean;
  onManageUnidades?: () => void;
  onLogout: () => void;
}

const SETORES = ["Armazém", "Docas", "Estoque", "Expedição", "Pátio", "Recebimento"];

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description: string;
}) {
  return <button type="button" role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)} className="profile-toggle">
    <span><strong>{label}</strong><span>{description}</span></span>
    <span className={`profile-switch ${enabled ? "is-enabled" : ""}`} aria-hidden="true"><span /></span>
  </button>;
}

export default function ProfileSettings({
  nome, perfil, supermercadoId, supermercadoNome, supermercados, setorPrincipal,
  notificacoesAtivas, somAtivo, pushAtivo, pushMessage, tema,
  onSupermercadoChange, onSetorPrincipalChange, onNotificacoesChange, onSomChange,
  onPushEnable, onPushDisable, onTemaChange, onVoltar, backLabel = "Voltar",
  showManageUnidadesAction = false, onManageUnidades, onLogout,
}: ProfileSettingsProps) {
  const supermercadosAtivos = supermercados.filter((item) => item.status === "Ativo");

  return <div className="app-page role-page profile-settings min-h-screen">
    <main className="app-main">
      <PageHeading variant="workspace" eyebrow="Minha conta" title="Perfil e configurações"
        description="Consulte seus dados e ajuste as preferências da sua rotina."
        actions={<>
          <button type="button" onClick={onVoltar} className="workspace-button workspace-button-secondary"><AdminIcon name="arrow" className="profile-back-icon" width={17} height={17} />{backLabel}</button>
          {showManageUnidadesAction && onManageUnidades && <button type="button" onClick={onManageUnidades} className="workspace-button workspace-button-primary"><AdminIcon name="units" width={17} height={17} />Gerenciar unidades</button>}
        </>}
      />
      <div className="profile-settings-grid">
        <section className="workspace-panel profile-identity" aria-labelledby="profile-user-title">
          <div className="profile-identity-heading">
            <span className="profile-avatar" aria-hidden="true">{nome.charAt(0).toUpperCase()}</span>
            <div><h2 id="profile-user-title">{nome}</h2><p>{perfil}</p></div>
          </div>
          <dl className="profile-data">
            {[{ label: "Nome", value: nome }, { label: "Perfil de acesso", value: perfil }, { label: "Unidade", value: supermercadoNome ?? "Todas as unidades" }, { label: "Setor principal", value: setorPrincipal }].map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
          <div className="profile-unit-field">
            <label htmlFor="profile-unit">Loja em operação</label>
            <p>Selecione a unidade vinculada à sua rotina.</p>
            <select id="profile-unit" value={supermercadoId ?? ""} onChange={(event) => {
              if (event.target.value) void onSupermercadoChange(event.target.value);
            }}>
              <option value="" disabled>Selecione a unidade</option>
              {supermercadosAtivos.map((item) => <option key={item.id} value={item.id}>{item.nome} ({item.codigo})</option>)}
            </select>
          </div>
        </section>

        <section className="workspace-panel" aria-labelledby="profile-preferences-title">
          <header className="profile-section-heading"><AdminIcon name="settings" /><div><h2 id="profile-preferences-title">Preferências</h2><p>Controle os avisos recebidos neste dispositivo.</p></div></header>
          <Toggle enabled={notificacoesAtivas} onChange={onNotificacoesChange} label="Notificações" description="Alertas de novos chamados e movimentações." />
          <Toggle enabled={somAtivo} onChange={onSomChange} label="Som" description="Avisos de áudio para eventos importantes." />
          <div className="profile-push">
            <h3>Push em segundo plano</h3><p>Receba atualizações com a aba fechada. A permissão é solicitada pelo navegador.</p>
            <button type="button" onClick={() => void (pushAtivo ? onPushDisable() : onPushEnable())} className="workspace-button workspace-button-secondary">
              {pushAtivo ? "Desativar push neste navegador" : "Ativar push neste navegador"}
            </button>
            {pushMessage && <p role="status" className="profile-push-message">{pushMessage}</p>}
          </div>
        </section>

        <section className="workspace-panel" aria-labelledby="profile-sector-title">
          <header className="profile-section-heading"><AdminIcon name="location" /><div><h2 id="profile-sector-title">Setor principal</h2><p>Defina onde você atua com mais frequência.</p></div></header>
          <div className="profile-sector-options">
            {SETORES.map((setor) => <button key={setor} type="button" aria-pressed={setor === setorPrincipal} onClick={() => onSetorPrincipalChange(setor)}>
              {setor}<span aria-hidden="true">{setor === setorPrincipal ? <AdminIcon name="check" width={18} height={18} /> : null}</span>
            </button>)}
          </div>
        </section>

        <section className="workspace-panel" aria-labelledby="profile-theme-title">
          <header className="profile-section-heading"><AdminIcon name={tema === "dark" ? "moon" : "sun"} /><div><h2 id="profile-theme-title">Aparência</h2><p>Seu tema é salvo neste navegador.</p></div></header>
          <div className="profile-theme-options">
            {([{ value: "light", label: "Claro", icon: "sun" }, { value: "dark", label: "Escuro", icon: "moon" }] as const).map((option) => (
              <button key={option.value} type="button" aria-pressed={tema === option.value} onClick={() => onTemaChange(option.value)}>
                <span className={`profile-theme-preview is-${option.value}`} aria-hidden="true"><span /><span /><span /></span>
                <span className="profile-theme-label"><AdminIcon name={option.icon} width={16} height={16} />{option.label}{tema === option.value && <span>Em uso</span>}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="workspace-panel profile-session" aria-labelledby="profile-session-title">
        <div><h2 id="profile-session-title">Conta e sessão</h2><p>Encerre a sessão atual para entrar com outro usuário.</p></div>
        <button type="button" onClick={onLogout} className="workspace-button workspace-button-danger"><AdminIcon name="logout" width={17} height={17} />Trocar usuário</button>
      </section>
    </main>
  </div>;
}
