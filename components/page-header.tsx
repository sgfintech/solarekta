import { SunIcon } from "@/components/icons";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1 font-display text-[1.85rem] font-bold leading-tight tracking-[-0.03em] text-forest-deep sm:text-[2.25rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-[0.9375rem] text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-2xl bg-sun-soft" />
        <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-mint" />
        <span className="relative text-sun-deep">{icon ?? <SunIcon className="h-7 w-7" />}</span>
      </div>
      <h2 className="text-xl text-forest-deep">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-ink-soft">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
