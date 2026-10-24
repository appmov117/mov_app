import { Check } from "lucide-react";
import { MAP_STYLES, type MapStyle, useMapStyle } from "../lib/mapStyle.ts";
import { SectionTitle } from "./ui/list.tsx";

type Props = {
  /** Sin `value` ni `onChange` lee y guarda la preferencia del usuario con sesión. */
  value?: MapStyle["id"];
  onChange?: (id: MapStyle["id"]) => void;
};

/** Lista para elegir el estilo de mapa predeterminado del usuario. */
export function MapStylePicker({ value, onChange }: Props) {
  const [saved, save] = useMapStyle();
  const current = value ?? saved.id;
  const choose = onChange ?? save;
  return (
    <>
      <SectionTitle>Mapa</SectionTitle>
      <ul className="rounded-2xl border border-line" role="radiogroup" aria-label="Estilo de mapa">
        {MAP_STYLES.map((style) => {
          const selected = style.id === current;
          return (
            <li key={style.id} className="border-b border-line last:border-0">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(style.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{style.label}</span>
                  <span className="block truncate text-xs text-muted">{style.detail}</span>
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
