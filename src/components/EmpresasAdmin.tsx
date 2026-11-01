import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { AssinaturaEmpresa } from "../types/empresa";
import type { Empresa, PlanoCiclo, PlanoStatus } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";
import AdminIcon from "./AdminIcon";
import CompanyActions from "./CompanyActions";

interface EmpresasAdminProps {
  empresas: Empresa[];
  unidades: Supermercado[];
  onCreate: (input: { nome: string; codigo: string; cnpj?: string }) => Promise<string | void>;
  onUpdate: (
    id: string,
    input: {
      nome: string;
      codigo: string;
      cnpj?: string;
      plano_codigo: string;
      plano_nome: string;
      plano_status: PlanoStatus;
      plano_ciclo: PlanoCiclo;
      max_usuarios?: number | null;
      max_unidades?: number | null;
      contrato_inicio?: string | null;
      contrato_fim?: string | null;
    }
  ) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onOpenSubscriptions?: () => void;
  onOpenCompany?: (empresaId: string, area: "unidades" | "usuarios" | "suporte") => void;
}

type FormState = {
  nome: string;
  codigo: string;
  cnpj: string;
  plano_codigo: string;
  plano_nome: string;
  plano_status: PlanoStatus;
  plano_ciclo: PlanoCiclo;
  max_usuarios: string;
  max_unidades: string;
  contrato_inicio: string;
  contrato_fim: string;
};

const EMPTY_FORM: FormState = {
  nome: "",
  codigo: "",
  cnpj: "",
  plano_codigo: "starter",
  plano_nome: "Plano Starter",
  plano_status: "Ativo",
  plano_ciclo: "Mensal",
  max_usuarios: "",
  max_unidades: "",
  contrato_inicio: "",
  contrato_fim: "",
};

const PLANO_STATUS_OPTIONS: PlanoStatus[] = ["Ativo", "Teste", "Suspenso", "Cancelado"];
const PLANO_CICLO_OPTIONS: PlanoCiclo[] = ["Mensal", "Trimestral", "Semestral", "Anual"];
const PLANO_OPTIONS = [
  { codigo: "starter", nome: "Plano Starter" },
  { codigo: "professional", nome: "Plano Professional" },
  { codigo: "enterprise", nome: "Plano Enterprise" },
  { codigo: "custom", nome: "Plano Customizado" },
] as const;

function parseNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function EmpresasAdmin({
  empresas,
  unidades,
  onCreate,
  onUpdate,
  onToggleStatus,
  onOpenSubscriptions,
  onOpenCompany,
}: EmpresasAdminProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const drawerRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [createdCompany, setCreatedCompany] = useState<string | null>(null);

  const empresasOrdenadas = useMemo(
    () =>
      [...empresas].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      ),
    [empresas]
  );

  const searchTerm = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const filteredCompanies = empresasOrdenadas.filter((empresa) => {
    const searchable = `${empresa.nome} ${empresa.codigo} ${empresa.cnpj ?? ""} ${(empresa.cnpj ?? "").replace(/\D/g, "")}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    return (statusFilter === "todas" || empresa.status === statusFilter) && searchable.includes(searchTerm);
  });
  const unitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unidade of unidades) counts.set(unidade.empresa_id, (counts.get(unidade.empresa_id) ?? 0) + 1);
    return counts;
  }, [unidades]);

  useEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    drawer.showModal();
    nameRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      drawer.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [drawerOpen]);

  function closeDrawer() {
    if (isSubmitting) return;
    setDrawerOpen(false);
    setError(null);
  }

  // Use canonical SaaS subscription documents, not legacy company plan defaults.
  const [saas, setSaas] = useState<Record<string, { loading: boolean; value: AssinaturaEmpresa | null; error: boolean }>>({});
  const idsKey = empresasOrdenadas.map((item) => item.id).join("|");
  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split("|") : [];
    setSaas(Object.fromEntries(ids.map((id) => [id, { loading: true, value: null, error: false }])));
    if (!db) {
      setSaas(Object.fromEntries(ids.map((id) => [id, { loading: false, value: null, error: true }])));
      return;
    }
    const firestore = db;
    for (const id of ids) {
      void getDoc(doc(firestore, "empresas", id, "assinaturas", "atual"))
        .then((snapshot) => {
          if (!cancelled) setSaas((previous) => ({ ...previous, [id]: {
            loading: false, value: snapshot.exists() ? snapshot.data() as AssinaturaEmpresa : null, error: false,
          }}));
        })
        .catch(() => {
          if (!cancelled) setSaas((previous) => ({ ...previous, [id]: { loading: false, value: null, error: true } }));
        });
    }
    return () => { cancelled = true; };
  }, [idsKey]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setCreatedCompany(null);
  }

  function validateForm() {
    if (!form.nome.trim()) return "Informe o nome da empresa.";
    if (!form.codigo.trim()) return "Informe o código da empresa.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingId) {
        await onUpdate(editingId, {
          nome: form.nome.trim(),
          codigo: form.codigo.trim().toUpperCase(),
          cnpj: form.cnpj.trim() || undefined,
          plano_codigo: form.plano_codigo.trim().toLowerCase(),
          plano_nome: form.plano_nome.trim(),
          plano_status: form.plano_status,
          plano_ciclo: form.plano_ciclo,
          max_usuarios: parseNullableNumber(form.max_usuarios),
          max_unidades: parseNullableNumber(form.max_unidades),
          contrato_inicio: form.contrato_inicio.trim() || null,
          contrato_fim: form.contrato_fim.trim() || null,
        });
        resetForm();
        setDrawerOpen(false);
      } else {
        const companyId = await onCreate({
          nome: form.nome.trim(),
          codigo: form.codigo.trim().toUpperCase(),
          cnpj: form.cnpj.trim() || undefined,
        });
        setCreatedCompany(companyId ?? form.codigo.trim().toUpperCase());
        setForm(EMPTY_FORM);
        setError(null);
        setSearch("");
        setStatusFilter("todas");
        setDrawerOpen(false);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível salvar a empresa."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(empresa: Empresa) {
    setEditingId(empresa.id);
    setForm({
      nome: empresa.nome,
      codigo: empresa.codigo,
      cnpj: empresa.cnpj ?? "",
      plano_codigo: empresa.plano_codigo,
      plano_nome: empresa.plano_nome,
      plano_status: empresa.plano_status,
      plano_ciclo: empresa.plano_ciclo,
      max_usuarios: empresa.max_usuarios?.toString() ?? "",
      max_unidades: empresa.max_unidades?.toString() ?? "",
      contrato_inicio: empresa.contrato_inicio ?? "",
      contrato_fim: empresa.contrato_fim ?? "",
    });
    setError(null);
    setDrawerOpen(true);
  }

  async function handleToggleStatus(id: string) {
    try {
      setPendingStatusId(id);
      setError(null);
      await onToggleStatus(id);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível atualizar o status da empresa."
      );
    } finally {
      setPendingStatusId(null);
    }
  }

  return (
    <main className="admin-companies">
      <header className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Gestão de clientes</p>
          <h1>Empresas</h1>
          <p>Organize as empresas, unidades e acessos da plataforma.</p>
        </div>
        <div className="admin-heading-actions">
          {onOpenSubscriptions && <button type="button" onClick={onOpenSubscriptions} className="admin-button admin-button-secondary"><AdminIcon name="subscription" width={18} height={18} />Planos e assinaturas</button>}
          <button type="button" className="admin-button admin-button-primary" onClick={() => { resetForm(); setDrawerOpen(true); }}><AdminIcon name="plus" width={18} height={18} />Nova empresa</button>
        </div>
      </header>

      {createdCompany && <div role="status" className="admin-success-message">
        <div><strong>Empresa cadastrada.</strong><p>Configure o plano e a assinatura para concluir o cadastro.</p>
          {onOpenSubscriptions && <button type="button" onClick={onOpenSubscriptions}>Configurar assinatura<AdminIcon name="arrow" width={16} height={16} /></button>}
        </div>
        <button type="button" className="admin-icon-button" onClick={() => setCreatedCompany(null)} aria-label="Fechar confirmação"><AdminIcon name="close" width={18} height={18} /></button>
      </div>}
      {error && !drawerOpen && <p role="alert" className="admin-error-message">{error}</p>}

      <section className="company-directory" aria-labelledby="company-directory-title">
        <div className="company-directory-heading">
          <h2 id="company-directory-title">Empresas cadastradas <span className="company-count">{empresas.length}</span></h2>
          <span className="company-directory-summary">{empresas.filter((empresa) => empresa.status === "Ativa").length} ativas</span>
        </div>
        <div className="company-directory-filters">
          <div className="company-search">
            <AdminIcon name="search" width={18} height={18} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar empresas por nome, código ou CNPJ" placeholder="Buscar por nome, código ou CNPJ" />
          </div>
          <label className="company-status-filter"><span>Situação</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todas">Todas</option><option value="Ativa">Ativas</option><option value="Inativa">Inativas</option>
            </select>
          </label>
        </div>
        {filteredCompanies.length === 0 ? <div className="company-empty-state">
          <span className="company-empty-icon"><AdminIcon name={empresas.length === 0 ? "company" : "search"} width={27} height={27} /></span>
          <h3>{empresas.length === 0 ? "Cadastre sua primeira empresa" : "Nenhuma empresa encontrada"}</h3>
          <p>{empresas.length === 0 ? "Adicione uma empresa para organizar suas unidades e responsáveis." : "Tente outro nome, código, CNPJ ou situação."}</p>
          <button type="button" className="admin-button admin-button-secondary" onClick={() => {
            if (empresas.length === 0) { resetForm(); setDrawerOpen(true); }
            else { setSearch(""); setStatusFilter("todas"); }
          }}>{empresas.length === 0 ? "Nova empresa" : "Limpar filtros"}</button>
        </div> : <table className="company-table" role="table" aria-label="Empresas cadastradas">
          <thead role="rowgroup"><tr role="row"><th scope="col">Empresa</th><th scope="col">Unidades</th><th scope="col">Assinatura</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
          <tbody role="rowgroup">{filteredCompanies.map((empresa) => {
            const info = saas[empresa.id];
            const assinatura = info?.value;
            return <tr key={empresa.id} role="row">
              <td className="company-name-cell" role="cell"><div className="company-name"><span className="company-monogram" aria-hidden="true">{empresa.nome.trim().slice(0, 2).toLocaleUpperCase("pt-BR")}</span><div><strong>{empresa.nome}</strong><span>{empresa.codigo} · {empresa.cnpj || "CNPJ não informado"}</span></div></div></td>
              <td data-label="Unidades" role="cell">{onOpenCompany ? <button type="button" className="company-unit-link" onClick={() => onOpenCompany(empresa.id, "unidades")} aria-label={`Ver ${unitCounts.get(empresa.id) ?? 0} unidades de ${empresa.nome}`}><AdminIcon name="units" width={16} height={16} />{unitCounts.get(empresa.id) ?? 0}</button> : unitCounts.get(empresa.id) ?? 0}</td>
              <td data-label="Assinatura" role="cell"><div className="company-subscription">
                {!info || info.loading ? <span className="company-muted">Consultando...</span> : info.error ? <span className="company-muted">Consulta indisponível</span> : assinatura ? <><strong>{assinatura.plano_nome}</strong><span className={`admin-status ${assinatura.status === "Ativa" ? "is-positive" : assinatura.status === "Cancelada" ? "is-neutral" : "is-warning"}`}>{assinatura.status}</span></> : <span className="admin-status is-warning">Sem assinatura</span>}
              </div></td>
              <td data-label="Situação" role="cell"><span className={`admin-status ${empresa.status === "Ativa" ? "is-positive" : "is-neutral"}`}><span className="company-status-dot" aria-hidden="true" />{empresa.status}</span></td>
              <td className="company-actions-cell" role="cell"><CompanyActions companyName={empresa.nome} active={empresa.status === "Ativa"} pending={pendingStatusId === empresa.id}
                onEdit={() => startEdit(empresa)} onToggleStatus={() => { void handleToggleStatus(empresa.id); }}
                onOpenCompany={onOpenCompany ? (area) => onOpenCompany(empresa.id, area) : undefined} /></td>
            </tr>;
          })}</tbody>
        </table>}
        <p className="company-results" role="status">{filteredCompanies.length} de {empresas.length} empresa(s)</p>
      </section>

      <dialog ref={drawerRef} className="admin-company-drawer" aria-labelledby="company-drawer-title" aria-describedby="company-drawer-description"
        onCancel={(event) => { event.preventDefault(); closeDrawer(); }} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
        <header className="company-drawer-heading">
          <div><p className="admin-eyebrow">{editingId ? "Dados da empresa" : "Novo cliente"}</p><h2 id="company-drawer-title">{editingId ? "Editar empresa" : "Nova empresa"}</h2><p id="company-drawer-description">{editingId ? "Atualize os dados cadastrais da empresa." : "Informe os dados abaixo. A assinatura poderá ser configurada em seguida."}</p></div>
          <button type="button" className="admin-icon-button" onClick={closeDrawer} disabled={isSubmitting} aria-label="Fechar cadastro de empresa"><AdminIcon name="close" /></button>
        </header>
        <form onSubmit={handleSubmit} className="company-drawer-form" aria-busy={isSubmitting}>
          <div className="company-drawer-fields"><fieldset disabled={isSubmitting}>
            <legend className="sr-only">Dados cadastrais</legend>
            <label>Nome da empresa <span aria-hidden="true">*</span><input ref={nameRef} type="text" name="nome" value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Ex.: Logística Central" required autoComplete="organization" /></label>
            <label>Código da empresa <span aria-hidden="true">*</span><input type="text" name="codigo" value={form.codigo} onChange={(event) => setForm((prev) => ({ ...prev, codigo: event.target.value }))} placeholder="Ex.: LOG-CENTRAL" required autoCapitalize="characters" spellCheck={false} aria-describedby="company-code-help" /><small id="company-code-help">Identificador usado para reconhecer a empresa no sistema.</small></label>
            <label>CNPJ <span className="company-optional">Opcional</span><input type="text" name="cnpj" value={form.cnpj} onChange={(event) => setForm((prev) => ({ ...prev, cnpj: event.target.value }))} placeholder="00.000.000/0000-00" inputMode="numeric" /></label>
            {editingId && <details className="company-legacy-fields"><summary>Dados do contrato legado</summary>
              <p>A assinatura atual é gerenciada em Planos e assinaturas. Estes campos mantêm os dados do cadastro anterior.</p>
              <label>Plano legado<select value={form.plano_codigo} onChange={(event) => { const selected = PLANO_OPTIONS.find((option) => option.codigo === event.target.value); setForm((prev) => ({ ...prev, plano_codigo: event.target.value, plano_nome: selected?.nome ?? prev.plano_nome })); }}>{PLANO_OPTIONS.map((option) => <option key={option.codigo} value={option.codigo}>{option.nome}</option>)}</select></label>
              <label>Nome exibido do plano<input type="text" value={form.plano_nome} onChange={(event) => setForm((prev) => ({ ...prev, plano_nome: event.target.value }))} /></label>
              <label>Situação do plano<select value={form.plano_status} onChange={(event) => setForm((prev) => ({ ...prev, plano_status: event.target.value as PlanoStatus }))}>{PLANO_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              <label>Ciclo<select value={form.plano_ciclo} onChange={(event) => setForm((prev) => ({ ...prev, plano_ciclo: event.target.value as PlanoCiclo }))}>{PLANO_CICLO_OPTIONS.map((ciclo) => <option key={ciclo} value={ciclo}>{ciclo}</option>)}</select></label>
              <label>Limite de usuários<input type="number" min="1" value={form.max_usuarios} onChange={(event) => setForm((prev) => ({ ...prev, max_usuarios: event.target.value }))} /></label>
              <label>Limite de unidades<input type="number" min="1" value={form.max_unidades} onChange={(event) => setForm((prev) => ({ ...prev, max_unidades: event.target.value }))} /></label>
              <label>Início do contrato<input type="date" value={form.contrato_inicio} onChange={(event) => setForm((prev) => ({ ...prev, contrato_inicio: event.target.value }))} /></label>
              <label>Fim do contrato<input type="date" value={form.contrato_fim} onChange={(event) => setForm((prev) => ({ ...prev, contrato_fim: event.target.value }))} /></label>
            </details>}
          </fieldset>
          {error && <p role="alert" className="admin-error-message">{error}</p>}
          </div>
          <footer className="company-drawer-footer"><button type="button" className="admin-button admin-button-secondary" onClick={closeDrawer} disabled={isSubmitting}>Cancelar</button><button type="submit" className="admin-button admin-button-primary" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar empresa"}</button></footer>
        </form>
      </dialog>
    </main>
  );
}
