import type { ReactNode } from "react";

type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  context?: ReactNode;
};

export default function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  context,
}: PageHeadingProps) {
  return (
    <section className="page-heading" aria-label={title}>
      <div className="page-heading-copy">
        <p className="page-heading-eyebrow">
          <span aria-hidden="true" className="page-heading-indicator" />
          {eyebrow}
        </p>
        <h1 className="page-heading-title">{title}</h1>
        <p className="page-heading-description">{description}</p>
        {context && <div className="page-heading-context">{context}</div>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </section>
  );
}
