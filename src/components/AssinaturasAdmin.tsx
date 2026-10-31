import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { AssinaturaEmpresa, EventoAssinatura, FirestoreDateValue, PlanoComercial } from "../types/empresa";
import type { Empresa } from "../types/empresa";
import { runSubscriptionAdminOperation, type SubscriptionAdminOperation } from "../services/subscriptions";
import { explainSubscriptionError } from "../utils/subscriptionErrors";
import type { AssinaturaCiclo, PlanoComercialStatus } from "../types/empresa";
import PageHeading from "./PageHeading";

interface Props { empresas: Empresa[]; onBack: () => void; actorName: string }
const cycles = ["Mensal", "Trimestral", "Semestral", "Anual"] as const;
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const fmtDate = (date?: FirestoreDateValue | null) => date ? (typeof date === "string" ? new Date(date) : date.toDate()).toLocaleDateString("pt-BR") : "—";

type PlanForm = { nome: string; descricao: string; valor: string; ciclo: AssinaturaCiclo; limite_usuarios: string; limite_filiais: string; status: PlanoComercialStatus };
const EMPTY_PLAN: PlanForm = { nome: "", descricao: "", valor: "", ciclo: "Mensal", limite_usuarios: "", limite_filiais: "", status: "Ativo" };

export default function AssinaturasAdmin({ empresas, onBack, actorName }: Props) {
  const [plans, setPlans] = useState<PlanoComercial[]>([]);
  const [companyId, setCompanyId] = useState(empresas[0]?.id ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [subscription, setSubscription] = useState<AssinaturaEmpresa | null>(null);
  const [history, setHistory] = useState<EventoAssinatura[]>([]);
  const [planAudit, setPlanAudit] = useState<EventoAssinatura[]>([]);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCompany = useMemo(() => empresas.find((company) => company.id === companyId), [empresas, companyId]);

  useEffect(() => {
    if (!companyId && empresas[0]) setCompanyId(empresas[0].id);
  }, [companyId, empresas]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "planos"), orderBy("nome")), (snapshot) => {
      setPlans(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PlanoComercial)));
    }, () => setError("Não foi possível carregar o catálogo de planos."));
  }, []);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "auditoria_assinaturas"), orderBy("ocorrido_em", "desc"), limit(30)), (snapshot) => {
      setPlanAudit(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventoAssinatura)));
    }, () => setError("Não foi possível carregar a auditoria dos planos."));
  }, []);

  useEffect(() => {
    if (!db || !companyId) { setSubscription(null); setHistory([]); return; }
    const unsubscribeSubscription = onSnapshot(doc(db, "empresas", companyId, "assinaturas", "atual"), (snapshot) => {
      setSubscription(snapshot.exists() ? snapshot.data() as AssinaturaEmpresa : null);
    }, () => setError("Não foi possível carregar a assinatura da empresa."));
    const unsubscribeHistory = onSnapshot(query(collection(db, "empresas", companyId, "historico_assinatura"), orderBy("ocorrido_em", "desc")), (snapshot) => {
      setHistory(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EventoAssinatura)));
    }, () => setError("Não foi possível carregar o histórico da empresa."));
    return () => { unsubscribeSubscription(); unsubscribeHistory(); };
  }, [companyId]);

  async function perform(action: SubscriptionAdminOperation, success: string): Promise<boolean> {
    setBusy(true); setError(""); setMessage("");
    try { await runSubscriptionAdminOperation(action); setMessage(success); return true; }
    catch (cause) {
      console.error("Falha na operação administrativa de assinatura", cause);
      setError(explainSubscriptionError(cause));
      return false;
    }
    finally { setBusy(false); }
  }

  async function savePlan(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(planForm.valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) { setError("Informe um valor válido em reais."); return; }
    const plan = { nome: planForm.nome, descricao: planForm.descricao, valor_centavos: Math.round(amount * 100), ciclo: planForm.ciclo, limite_usuarios: planForm.limite_usuarios ? Number(planForm.limite_usuarios) : null, limite_filiais: planForm.limite_filiais ? Number(planForm.limite_filiais) : null, status: planForm.status };
    const saved = await perform({ action: "savePlan", planId: editingPlanId, plan }, editingPlanId ? "Plano atualizado." : "Plano cadastrado.");
    if (saved) { setPlanForm(EMPTY_PLAN); setEditingPlanId(null); }
  }

  function editPlan(plan: PlanoComercial) {
    setEditingPlanId(plan.id);
    setPlanForm({ nome: plan.nome, descricao: plan.descricao, valor: (plan.valor_centavos / 100).toFixed(2).replace(".", ","), ciclo: plan.ciclo, limite_usuarios: plan.limite_usuarios?.toString() ?? "", limite_filiais: plan.limite_filiais?.toString() ?? "", status: plan.status });
  }

  const selectedPlan = plans.find((plan) => plan.id === subscription?.plano_id);
  const activePlans = plans.filter((plan) => plan.status === "Ativo");
  const chosenPlan = activePlans.find((plan) => plan.id === selectedPlanId);

  return <main className="app-main space-y-6 px-3 py-6 sm:px-0">
    <PageHeading
      eyebrow="Administrador da plataforma"
      title="Planos e assinaturas SaaS"
      description="Uma assinatura por empresa, independente do número de filiais. Ativação e renovação manuais."
      actions={<button onClick={onBack} className="touch-target rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">Voltar ao painel</button>}
    />
    {(message || error) && <div role="status" className={`rounded-xl p-3 ${error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}
    <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-bold">{editingPlanId ? "Editar plano" : "Cadastrar plano"}</h3><form className="grid gap-3 sm:grid-cols-2" onSubmit={savePlan}>
        <label className="grid gap-1 text-sm font-semibold">Nome<input required maxLength={80} className="rounded-lg border p-2 font-normal" value={planForm.nome} onChange={(e) => setPlanForm({ ...planForm, nome: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Valor por ciclo (R$)<input required inputMode="decimal" className="rounded-lg border p-2 font-normal" value={planForm.valor} onChange={(e) => setPlanForm({ ...planForm, valor: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Ciclo<select className="rounded-lg border p-2 font-normal" value={planForm.ciclo} onChange={(e) => setPlanForm({ ...planForm, ciclo: e.target.value as AssinaturaCiclo })}>{cycles.map((cycle) => <option key={cycle}>{cycle}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Status<select className="rounded-lg border p-2 font-normal" value={planForm.status} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value as PlanoComercialStatus })}><option>Ativo</option><option>Inativo</option></select></label>
        <label className="grid gap-1 text-sm font-semibold">Limite de usuários<input type="number" min="1" className="rounded-lg border p-2 font-normal" value={planForm.limite_usuarios} onChange={(e) => setPlanForm({ ...planForm, limite_usuarios: e.target.value })} placeholder="Sem limite" /></label>
        <label className="grid gap-1 text-sm font-semibold">Limite de filiais<input type="number" min="1" className="rounded-lg border p-2 font-normal" value={planForm.limite_filiais} onChange={(e) => setPlanForm({ ...planForm, limite_filiais: e.target.value })} placeholder="Sem limite" /></label>
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Descrição<textarea maxLength={500} className="rounded-lg border p-2 font-normal" value={planForm.descricao} onChange={(e) => setPlanForm({ ...planForm, descricao: e.target.value })} /></label>
        <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="rounded-xl bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar plano"}</button>{editingPlanId && <button type="button" onClick={() => { setEditingPlanId(null); setPlanForm(EMPTY_PLAN); }} className="rounded-xl border px-4 py-2">Cancelar</button>}</div>
      </form><div className="mt-5 divide-y">{plans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold">{plan.nome} <span className="text-sm font-normal text-slate-500">· {plan.ciclo} · {money(plan.valor_centavos)} · {plan.status}</span></p><p className="text-xs text-slate-500">{plan.descricao || "Sem descrição"}</p></div><button onClick={() => editPlan(plan)} className="rounded-lg border px-3 py-1.5 text-sm">Editar</button></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-bold">Assinatura por empresa</h3><label className="grid gap-1 text-sm font-semibold">Empresa<select className="rounded-lg border p-2 font-normal" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>{empresas.map((company) => <option key={company.id} value={company.id}>{company.nome} · {company.codigo}</option>)}</select></label>
        {selectedCompany && <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="font-bold">{selectedCompany.nome}</p><p className="text-sm text-slate-600">{subscription ? `${subscription.plano_nome} · ${subscription.status} · ${money(subscription.valor_centavos)}/${subscription.ciclo.toLowerCase()}` : "Sem plano vinculado"}</p><p className="text-sm text-slate-600">Vigência: {fmtDate(subscription?.inicio_em)} – {fmtDate(subscription?.vence_em)}</p><p className="mt-1 text-xs text-slate-500">A mesma assinatura cobre todas as filiais da empresa.</p></div>}
        <label className="mt-4 grid gap-1 text-sm font-semibold">Plano para vincular<select id="subscription-plan" className="rounded-lg border p-2 font-normal" value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}><option value="">Selecione um plano ativo</option>{activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome} · {money(plan.valor_centavos)}/{plan.ciclo.toLowerCase()}</option>)}</select></label>
        {chosenPlan && <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"><p className="font-bold">{chosenPlan.nome}</p><p>{money(chosenPlan.valor_centavos)} por ciclo · {chosenPlan.ciclo}</p><p>Limites: {chosenPlan.limite_usuarios ?? "Sem limite"} usuários · {chosenPlan.limite_filiais ?? "Sem limite"} filiais</p></div>}
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !selectedCompany || !chosenPlan} onClick={() => { if (selectedPlanId && companyId) void perform({ action: "assignPlan", empresaId: companyId, planId: selectedPlanId }, "Plano vinculado à empresa."); }} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">Vincular plano</button><button disabled={busy || !selectedCompany || !selectedPlan} onClick={() => void perform({ action: "activate", empresaId: companyId, planId: selectedPlan!.id }, "Assinatura ativada manualmente.")} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Ativar</button><button disabled={busy || !selectedCompany || !selectedPlan || !subscription} onClick={() => void perform({ action: "renew", empresaId: companyId, planId: selectedPlan!.id }, "Assinatura renovada manualmente.")} className="rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Renovar</button></div>
        <p className="mt-3 text-xs text-slate-500">Pagamento automático e bloqueio por vencimento estão desativados. Operação registrada por {actorName}.</p>
        <h4 className="mt-6 font-bold">Histórico</h4><div className="mt-2 max-h-72 divide-y overflow-auto">{history.length ? history.map((event) => <article key={event.id} className="py-3 text-sm"><p className="font-semibold">{event.acao.replace(/_/g, " ")} · {fmtDate(event.ocorrido_em)}</p><p className="text-slate-600">{event.ator_nome} · {String(event.detalhes.plano_nome ?? event.plano_id)}{typeof event.detalhes.valor_centavos === "number" ? ` · ${money(event.detalhes.valor_centavos)}` : ""}</p></article>) : <p className="py-3 text-sm text-slate-500">Nenhuma alteração registrada.</p>}</div>
      </div>
    </section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Auditoria do catálogo de planos</h3><div className="mt-2 divide-y">{planAudit.length ? planAudit.map((event) => <article key={event.id} className="py-3 text-sm"><p className="font-semibold">{event.acao.replace(/_/g, " ")} · {fmtDate(event.ocorrido_em)}</p><p className="text-slate-600">{event.ator_nome} · {String(event.detalhes.nome ?? event.plano_id)}{typeof event.detalhes.valor_centavos === "number" ? ` · ${money(event.detalhes.valor_centavos)}` : ""}</p></article>) : <p className="py-3 text-sm text-slate-500">Nenhuma alteração de plano registrada.</p>}</div></section>
  </main>;
}
