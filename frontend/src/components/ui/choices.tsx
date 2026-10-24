import { Check } from "lucide-react";
import { SectionTitle } from "./list.tsx";

type Option<T extends string> = { id: T; label: string; detail: string };

/** Lista de opciones excluyentes con el mismo estilo que las filas del perfil. */
export function ChoiceList<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <ul className="rounded-2xl border border-line" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <li key={option.id} className="border-b border-line last:border-0">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(option.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block truncate text-xs text-muted">{option.detail}</span>
                </span>
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                    selected ? "border-brand-strong bg-brand-strong text-white" : "border-line"
                  }`}
                  aria-hidden="true"
                >
                  {selected && <Check size={14} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
