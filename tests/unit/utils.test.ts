import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { __test } from "@/components/kiosk/storage";
import { kioskPinHash } from "@/lib/crypto";
import { csvCell, csvRow } from "@/lib/csv";
import { addDays, startOfDayInTz } from "@/lib/dates";
import { slugify } from "@/lib/slug";
import { surveyInputSchema } from "@/lib/survey-schema";
import { BASE_TEMPLATE } from "@/lib/survey-template";

describe("csv", () => {
  it("escapa comas, comillas y saltos de línea", () => {
    expect(csvCell('Dijo "hola", y se fue')).toBe('"Dijo ""hola"", y se fue"');
    expect(csvCell("línea1\nlínea2")).toBe('"línea1\nlínea2"');
  });
  it("neutraliza fórmulas de Excel", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+52 229")).toBe("'+52 229");
    expect(csvCell("@sum")).toBe("'@sum");
  });
  it("arma filas", () => {
    expect(csvRow(["a", 1, null, undefined, true])).toBe("a,1,,,true");
  });
});

describe("slugify", () => {
  it("quita acentos y espacios", () => {
    expect(slugify("  Casa Jarocha — Boca del Río ")).toBe("casa-jarocha-boca-del-rio");
    expect(slugify("Ñuñoa & Cía.")).toBe("nunoa-cia");
  });
});

describe("fechas", () => {
  it("inicio del día en Ciudad de México (UTC-6)", () => {
    expect(startOfDayInTz("2026-09-30", "America/Mexico_City").toISOString()).toBe("2026-09-30T06:00:00.000Z");
  });
  it("addDays cruza meses", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("PIN de kiosko", () => {
  it("el SHA-256 en JS de la tablet coincide con el del servidor", () => {
    const input = "kiosk:abc:1234";
    const js = __test.sha256Fallback(new TextEncoder().encode(input));
    expect(js).toBe(createHash("sha256").update(input).digest("hex"));
    expect(kioskPinHash("abc", "1234")).toBe(js);
  });
  it("funciona con textos largos (varios bloques)", () => {
    const input = "x".repeat(200);
    expect(__test.sha256Fallback(new TextEncoder().encode(input))).toBe(createHash("sha256").update(input).digest("hex"));
  });
});

describe("esquema de encuesta", () => {
  const base = {
    title: "Encuesta",
    welcomeText: "",
    closingText: "¡Vuelva pronto! 🙂",
    questions: BASE_TEMPLATE.map((q) => ({ ...q, options: undefined })),
  };
  it("acepta la plantilla base", () => {
    expect(surveyInputSchema.safeParse(base).success).toBe(true);
  });
  it("no permite repetir un indicador", () => {
    const dup = { ...base, questions: [...base.questions, { ...base.questions[1] }] };
    expect(surveyInputSchema.safeParse(dup).success).toBe(false);
  });
  it("no permite un indicador incompatible con el tipo", () => {
    const bad = { ...base, questions: [{ type: "YES_NO", text: "¿Todo bien?", required: true, metric: "FOOD" }] };
    expect(surveyInputSchema.safeParse(bad).success).toBe(false);
  });
  it("opción única requiere 2 opciones distintas", () => {
    const q = { type: "SINGLE_CHOICE", text: "¿Dónde te sentaste?", required: true, metric: "NONE" };
    expect(surveyInputSchema.safeParse({ ...base, questions: [{ ...q, choices: ["Terraza"] }] }).success).toBe(false);
    expect(surveyInputSchema.safeParse({ ...base, questions: [{ ...q, choices: ["A", "A"] }] }).success).toBe(false);
    expect(surveyInputSchema.safeParse({ ...base, questions: [{ ...q, choices: ["Terraza", "Salón"] }] }).success).toBe(true);
  });
  it("opciones vacías dan un mensaje en español", () => {
    const q = { type: "SINGLE_CHOICE", text: "¿Dónde te sentaste?", required: true, metric: "NONE", choices: ["", ""] };
    const r = surveyInputSchema.safeParse({ ...base, questions: [q] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("Escribe el texto de cada opción");
  });
  it("exige al menos una pregunta", () => {
    expect(surveyInputSchema.safeParse({ ...base, questions: [] }).success).toBe(false);
  });
});
