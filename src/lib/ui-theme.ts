/**
 * Colores de acento de la interfaz (botones principales, menú activo, enlaces e interruptores).
 * Se elige uno en Administración → Ajustes y vale para todo el sistema: sitio público, entrada,
 * panel de cada negocio y Administración. La encuesta del comensal usa el color de cada restaurante.
 */
export type AccentPreset = { id: string; name: string; main: string; dark: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "jade", name: "Jade", main: "#0e8a6e", dark: "#0a6b55" },
  { id: "jamaica", name: "Jamaica", main: "#c2185b", dark: "#9c1249" },
  { id: "mandarina", name: "Mandarina", main: "#e2560b", dark: "#bb430a" },
  { id: "talavera", name: "Azul talavera", main: "#2557d6", dark: "#1c44ad" },
  { id: "uva", name: "Uva", main: "#7340d8", dark: "#5c2fb5" },
  { id: "cacao", name: "Cacao", main: "#93562b", dark: "#74421f" },
  { id: "chile", name: "Rojo chile", main: "#d42f2f", dark: "#ad2222" },
];

export const DEFAULT_ACCENT = "jade";

export function accentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT)!;
}

export function accentCss(id: string | null | undefined) {
  const p = accentPreset(id);
  return `:root{--accent:${p.main};--accent-dark:${p.dark};}`;
}

/** Cookie del interruptor "Tema oscuro" de los paneles (solo cambia lo que ve ese navegador). */
export const THEME_COOKIE = "tema";
