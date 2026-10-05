import { describe, expect, it } from "vitest";
import {
  AnswerValidationError,
  canDeleteSurvey,
  canEditSurvey,
  isLowScore,
  type RuleQuestion,
  validateAnswers,
} from "@/lib/survey-rules";

const qs: RuleQuestion[] = [
  { id: "first", type: "YES_NO", required: true, metric: "FIRST_VISIT" },
  { id: "food", type: "RATING_5", required: true, metric: "FOOD" },
  { id: "nps", type: "NPS_10", required: true, metric: "RECOMMEND" },
  { id: "area", type: "SINGLE_CHOICE", required: false, metric: "NONE", options: { choices: ["Terraza", "Salón"] } },
  { id: "comment", type: "TEXT", required: false, metric: "COMMENT" },
];

const valid = { first: true, food: 4, nps: 9 };

describe("validateAnswers", () => {
  it("normaliza respuestas válidas", () => {
    const out = validateAnswers(qs, { ...valid, area: "Terraza", comment: "  Muy rico  " });
    expect(out).toEqual([
      { questionId: "first", valueBool: true, valueNumber: null, valueText: null },
      { questionId: "food", valueBool: null, valueNumber: 4, valueText: null },
      { questionId: "nps", valueBool: null, valueNumber: 9, valueText: null },
      { questionId: "area", valueBool: null, valueNumber: null, valueText: "Terraza" },
      { questionId: "comment", valueBool: null, valueNumber: null, valueText: "Muy rico" },
    ]);
  });

  it("exige las obligatorias", () => {
    expect(() => validateAnswers(qs, { first: true, food: 4 })).toThrow(AnswerValidationError);
  });

  it("omite opcionales vacías", () => {
    expect(validateAnswers(qs, { ...valid, comment: "   " })).toHaveLength(3);
  });

  it("rechaza valores fuera de rango o de tipo incorrecto", () => {
    expect(() => validateAnswers(qs, { ...valid, food: 6 })).toThrow("1 a 5");
    expect(() => validateAnswers(qs, { ...valid, food: 3.5 })).toThrow();
    expect(() => validateAnswers(qs, { ...valid, nps: 11 })).toThrow("0 a 10");
    expect(() => validateAnswers(qs, { ...valid, first: "sí" })).toThrow();
    expect(() => validateAnswers(qs, { ...valid, area: "Barra" })).toThrow("Opción");
  });

  it("ignora ids que no son de la encuesta", () => {
    expect(validateAnswers(qs, { ...valid, otra: 5 })).toHaveLength(3);
  });

  it("recorta textos largos", () => {
    const out = validateAnswers(qs, { ...valid, comment: "x".repeat(1500) });
    expect(out.at(-1)!.valueText).toHaveLength(1000);
  });
});

describe("isLowScore", () => {
  it("marca 2 estrellas o menos", () => {
    expect(isLowScore(qs, validateAnswers(qs, { ...valid, food: 2 }))).toBe(true);
    expect(isLowScore(qs, validateAnswers(qs, { ...valid, food: 3 }))).toBe(false);
  });
  it("marca recomendación de 6 o menos", () => {
    expect(isLowScore(qs, validateAnswers(qs, { ...valid, nps: 6 }))).toBe(true);
    expect(isLowScore(qs, validateAnswers(qs, { ...valid, nps: 7 }))).toBe(false);
  });
});

describe("reglas de edición", () => {
  it("solo se edita sin respuestas", () => {
    expect(canEditSurvey(0)).toBe(true);
    expect(canEditSurvey(1)).toBe(false);
  });
  it("solo se borran borradores sin respuestas", () => {
    expect(canDeleteSurvey("DRAFT", 0)).toBe(true);
    expect(canDeleteSurvey("DRAFT", 3)).toBe(false);
    expect(canDeleteSurvey("ACTIVE", 0)).toBe(false);
  });
});
