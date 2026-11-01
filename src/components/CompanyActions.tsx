import { useEffect, useId, useRef, useState } from "react";
import AdminIcon from "./AdminIcon";

type Props = {
  companyName: string;
  active: boolean;
  pending: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onOpenCompany?: (area: "unidades" | "usuarios" | "suporte") => void;
};

export default function CompanyActions({ companyName, active, pending, onEdit, onToggleStatus, onOpenCompany }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="company-actions" ref={containerRef}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } }}>
      <button type="button" className="admin-button admin-button-secondary company-edit-button" onClick={onEdit} disabled={pending} aria-label={`Editar ${companyName}`}>
        <AdminIcon name="edit" width={16} height={16} />Editar
      </button>
      <button type="button" className="admin-icon-button" ref={triggerRef} onClick={() => setOpen(!open)} aria-label={`Mais ações para ${companyName}`} aria-expanded={open} aria-controls={open ? panelId : undefined} disabled={pending}>
        <AdminIcon name="more" />
      </button>
      {open && <div id={panelId} className="company-actions-menu" role="group" aria-label={`Ações para ${companyName}`}>
        {onOpenCompany && <>
          <button type="button" onClick={() => { setOpen(false); onOpenCompany("unidades"); }}><AdminIcon name="units" width={17} height={17} />Unidades</button>
          <button type="button" onClick={() => { setOpen(false); onOpenCompany("usuarios"); }}><AdminIcon name="users" width={17} height={17} />Acessos</button>
          <button type="button" onClick={() => { setOpen(false); onOpenCompany("suporte"); }}><AdminIcon name="support" width={17} height={17} />Consultar operação</button>
        </>}
        <button type="button" className={active ? "company-action-warning" : ""} onClick={() => { setOpen(false); onToggleStatus(); }} disabled={pending}>
          <span className="company-status-dot" aria-hidden="true" />{active ? "Inativar empresa" : "Ativar empresa"}
        </button>
      </div>}
      {pending && <span className="sr-only" role="status">Atualizando {companyName}...</span>}
    </div>
  );
}
