import { X } from "lucide-react";
import { useEffect } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 shadow-[0_18px_60px_-46px_var(--brand-ink)] transition-all duration-200 hover:shadow-[0_24px_60px_-38px_var(--brand-ink)] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  icon?: React.ElementType;
}) {
  return (
    <Panel className="group relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[.68rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div
            className="grid h-10 w-10 place-items-center rounded-xl text-white transition-transform duration-200 group-hover:scale-110"
            style={{ background: accent ?? "var(--brand-violet)" }}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
    </Panel>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`mt-10 w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-border bg-card p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function Btn({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "soft" | "danger";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    ghost: "border border-border bg-background text-foreground hover:bg-secondary",
    soft: "bg-secondary text-foreground hover:bg-secondary/70",
    danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
