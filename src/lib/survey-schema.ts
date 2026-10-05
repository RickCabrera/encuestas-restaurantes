import { z } from "zod";
import { METRICS_BY_TYPE } from "./survey-template";

export const questionInputSchema = z
  .object({
    type: z.enum(["YES_NO", "RATING_5", "NPS_10", "SINGLE_CHOICE", "TEXT"]),
    text: z.string().trim().min(3, "Escribe la pregunta").max(200, "Máximo 200 caracteres"),
    required: z.boolean(),
    metric: z.enum(["NONE", "FIRST_VISIT", "FOOD", "CAPTAIN_VISIT", "SERVICE", "RECOMMEND", "COMMENT"]),
    choices: z
      .array(z.string().trim().min(1, "Escribe el texto de cada opción").max(80, "Cada opción admite hasta 80 caracteres"))
      .max(10, "Máximo 10 opciones")
      .optional(),
  })
  .superRefine((q, ctx) => {
    if (!METRICS_BY_TYPE[q.type].includes(q.metric)) {
      ctx.addIssue({ code: "custom", path: ["metric"], message: "Indicador no compatible con el tipo" });
    }
    if (q.type === "SINGLE_CHOICE") {
      const choices = (q.choices ?? []).filter(Boolean);
      if (choices.length < 2) ctx.addIssue({ code: "custom", path: ["choices"], message: "Agrega al menos 2 opciones" });
      if (new Set(choices).size !== choices.length)
        ctx.addIssue({ code: "custom", path: ["choices"], message: "Las opciones no se pueden repetir" });
    }
  });

export const surveyInputSchema = z
  .object({
    title: z.string().trim().min(3, "Escribe un título").max(100),
    welcomeText: z.string().trim().max(300),
    closingText: z.string().trim().min(1, "Escribe el mensaje final").max(200),
    questions: z.array(questionInputSchema).min(1, "Agrega al menos una pregunta").max(30, "Máximo 30 preguntas"),
  })
  .superRefine((s, ctx) => {
    // Cada indicador (salvo NONE) solo puede usarse una vez por encuesta.
    const seen = new Set<string>();
    s.questions.forEach((q, i) => {
      if (q.metric === "NONE") return;
      if (seen.has(q.metric))
        ctx.addIssue({ code: "custom", path: ["questions", i, "metric"], message: "Ese indicador ya se usa en otra pregunta" });
      seen.add(q.metric);
    });
  });

export type SurveyInput = z.infer<typeof surveyInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
