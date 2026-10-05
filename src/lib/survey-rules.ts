import type { QuestionMetric, QuestionType } from "@/db/schema";

export type RuleQuestion = {
  id: string;
  type: QuestionType;
  required: boolean;
  metric: QuestionMetric;
  options?: { choices?: string[] } | null;
};

/** Valor crudo que envía el cliente para una pregunta. */
export type RawAnswerValue = boolean | number | string | null | undefined;

export type NormalizedAnswer = {
  questionId: string;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueText: string | null;
};

export const MAX_TEXT_LENGTH = 1000;

export class AnswerValidationError extends Error {
  constructor(
    message: string,
    public questionId?: string,
  ) {
    super(message);
  }
}

function isEmpty(v: RawAnswerValue) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Valida y normaliza las respuestas contra las preguntas de la encuesta.
 * Ignora ids que no pertenecen a la encuesta y exige las obligatorias.
 */
export function validateAnswers(questions: RuleQuestion[], raw: Record<string, RawAnswerValue>): NormalizedAnswer[] {
  const out: NormalizedAnswer[] = [];
  for (const q of questions) {
    const v = raw[q.id];
    if (isEmpty(v)) {
      if (q.required) throw new AnswerValidationError("Falta responder una pregunta obligatoria", q.id);
      continue;
    }
    const base: NormalizedAnswer = { questionId: q.id, valueNumber: null, valueBool: null, valueText: null };
    switch (q.type) {
      case "YES_NO":
        if (typeof v !== "boolean") throw new AnswerValidationError("Respuesta Sí/No inválida", q.id);
        out.push({ ...base, valueBool: v });
        break;
      case "RATING_5":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5)
          throw new AnswerValidationError("La calificación debe ser de 1 a 5", q.id);
        out.push({ ...base, valueNumber: v });
        break;
      case "NPS_10":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10)
          throw new AnswerValidationError("La recomendación debe ser de 0 a 10", q.id);
        out.push({ ...base, valueNumber: v });
        break;
      case "SINGLE_CHOICE": {
        const choices = q.options?.choices ?? [];
        if (typeof v !== "string" || !choices.includes(v)) throw new AnswerValidationError("Opción inválida", q.id);
        out.push({ ...base, valueText: v });
        break;
      }
      case "TEXT": {
        if (typeof v !== "string") throw new AnswerValidationError("Texto inválido", q.id);
        const text = v.trim().slice(0, MAX_TEXT_LENGTH);
        out.push({ ...base, valueText: text });
        break;
      }
    }
  }
  return out;
}

/** Umbrales de "calificación baja" (para alertas y filtro de comentarios). */
export const LOW_RATING_MAX = 2;
export const LOW_NPS_MAX = 6;

export function isLowScore(questions: RuleQuestion[], answers: NormalizedAnswer[]): boolean {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return answers.some((a) => {
    const q = byId.get(a.questionId);
    if (!q || a.valueNumber === null) return false;
    if (q.type === "RATING_5") return a.valueNumber <= LOW_RATING_MAX;
    if (q.type === "NPS_10") return a.valueNumber <= LOW_NPS_MAX;
    return false;
  });
}

/** Una encuesta solo es editable mientras no tenga respuestas. */
export function canEditSurvey(responseCount: number) {
  return responseCount === 0;
}

/** Solo se pueden borrar borradores sin respuestas. */
export function canDeleteSurvey(status: string, responseCount: number) {
  return status === "DRAFT" && responseCount === 0;
}
