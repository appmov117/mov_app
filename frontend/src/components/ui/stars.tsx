import { Star } from "lucide-react";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  on?: string;
  off?: string;
  className?: string;
};

/** Cinco estrellas; si recibe onChange, cada estrella es un botón para calificar. */
export function Stars({ value, onChange, size = 22, on = "text-star", off = "text-ink/25", className = "" }: Props) {
  return (
    <div className={`flex gap-1 ${className}`} role={onChange ? "radiogroup" : "img"} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((score) => {
        const icon = <Star size={size} className={score <= value ? on : off} fill={score <= value ? "currentColor" : "none"} />;
        return onChange ? (
          <button key={score} type="button" role="radio" aria-checked={score === value} aria-label={`${score} estrellas`} onClick={() => onChange(score)}>
            {icon}
          </button>
        ) : (
          <span key={score}>{icon}</span>
        );
      })}
    </div>
  );
}
