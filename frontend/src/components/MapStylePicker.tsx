import { MAP_STYLES, type MapStyle, useMapStyle } from "../lib/mapStyle.ts";
import { ChoiceList } from "./ui/choices.tsx";

type Props = {
  /** Sin `value` ni `onChange` lee y guarda la preferencia del usuario con sesión. */
  value?: MapStyle["id"];
  onChange?: (id: MapStyle["id"]) => void;
};

/** Lista para elegir el estilo de mapa predeterminado del usuario. */
export function MapStylePicker({ value, onChange }: Props) {
  const [saved, save] = useMapStyle();
  return <ChoiceList title="Mapa" options={MAP_STYLES} value={value ?? saved.id} onChange={onChange ?? save} />;
}
