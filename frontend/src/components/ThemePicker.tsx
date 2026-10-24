import { THEMES, useTheme } from "../lib/theme.ts";
import { ChoiceList } from "./ui/choices.tsx";

/** Lista para elegir entre tema del sistema, claro u oscuro. */
export function ThemePicker() {
  const [theme, choose] = useTheme();
  return <ChoiceList title="Apariencia" options={THEMES} value={theme} onChange={choose} />;
}
