import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function SectionCard({ title, subtitle, actions, footer, className, bodyClassName, children }: Props) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {title || actions ? (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            {title ? <h3 className="font-heading text-sm font-semibold text-slate-900">{title}</h3> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-5 pb-5", title ? "pt-4" : "pt-5", bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{footer}</footer> : null}
    </section>
  );
}
