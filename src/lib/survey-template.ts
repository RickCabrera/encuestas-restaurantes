import type { QuestionMetric, QuestionOptions, QuestionType } from "@/db/schema";

export type QuestionDraft = {
  type: QuestionType;
  text: string;
  required: boolean;
  metric: QuestionMetric;
  options?: QuestionOptions | null;
};

export const DEFAULT_WELCOME = "Tu opinión nos ayuda a mejorar. Son menos de 30 segundos.";
export const DEFAULT_CLOSING = "¡Vuelva pronto! 🙂";

/** Encuesta base que entregó el cliente. */
export const BASE_TEMPLATE: QuestionDraft[] = [
  { type: "YES_NO", text: "¿Es primera vez que nos visitan?", required: true, metric: "FIRST_VISIT" },
  {
    type: "RATING_5",
    text: "¿Qué calificación le das a nuestros alimentos?",
    required: true,
    metric: "FOOD",
  },
  { type: "YES_NO", text: "¿Un jefe de mesas visitó su mesa?", required: true, metric: "CAPTAIN_VISIT" },
  { type: "RATING_5", text: "¿Cómo fue la atención del mesero(a)?", required: true, metric: "SERVICE" },
  { type: "NPS_10", text: "¿Nos recomendarías?", required: true, metric: "RECOMMEND" },
  {
    type: "TEXT",
    text: "¿Alguna queja, sugerencia o felicitación que quiera agregar?",
    required: false,
    metric: "COMMENT",
  },
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  YES_NO: "Sí / No",
  RATING_5: "Estrellas (1 a 5)",
  NPS_10: "Recomendación (0 a 10)",
  SINGLE_CHOICE: "Opción única",
  TEXT: "Texto libre",
};

export const METRIC_LABELS: Record<QuestionMetric, string> = {
  NONE: "Sin indicador",
  FIRST_VISIT: "Primera visita",
  FOOD: "Calificación de alimentos",
  CAPTAIN_VISIT: "Visita del jefe de mesas",
  SERVICE: "Atención del mesero",
  RECOMMEND: "Recomendación (NPS)",
  COMMENT: "Comentarios",
};

/** Qué indicadores son compatibles con cada tipo de pregunta. */
export const METRICS_BY_TYPE: Record<QuestionType, QuestionMetric[]> = {
  YES_NO: ["NONE", "FIRST_VISIT", "CAPTAIN_VISIT"],
  RATING_5: ["NONE", "FOOD", "SERVICE"],
  NPS_10: ["NONE", "RECOMMEND"],
  SINGLE_CHOICE: ["NONE"],
  TEXT: ["NONE", "COMMENT"],
};
