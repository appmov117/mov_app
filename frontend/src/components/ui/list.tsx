import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-bold text-ink">{children}</h2>;
}

export function LinkRow({ to, icon, label, detail }: { to: string; icon: ReactNode; label: string; detail?: string }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link to={to} className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-muted" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{label}</span>
          {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
        </span>
        <ChevronRight size={18} className="text-ink/30" aria-hidden="true" />
      </Link>
    </li>
  );
}
