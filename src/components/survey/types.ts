export type RunnerQuestion = {
  id: string;
  type: "YES_NO" | "RATING_5" | "NPS_10" | "SINGLE_CHOICE" | "TEXT";
  text: string;
  required: boolean;
  options?: { choices?: string[] } | null;
};

export type RunnerSurvey = {
  id: string;
  welcomeText: string;
  closingText: string;
  questions: RunnerQuestion[];
};

export type RunnerRestaurant = {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
};

export type AnswerValue = boolean | number | string;

export type SubmitPayload = {
  id: string;
  surveyId: string;
  answers: Record<string, AnswerValue>;
  startedAt: string;
  submittedAt: string;
  tableRef?: string | null;
  website?: string; // honeypot
};

/** Elige texto blanco u oscuro según la luminancia del color de marca. */
export function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#1c2621" : "#ffffff";
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Respaldo para navegadores viejos sin randomUUID.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}
