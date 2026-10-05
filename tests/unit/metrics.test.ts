import { describe, expect, it } from "vitest";
import { average, bucketKey, distribution, formatNps, nps, percentTrue } from "@/lib/metrics";

describe("nps", () => {
  it("calcula promotores, pasivos y detractores", () => {
    const r = nps([10, 9, 8, 7, 6, 0]);
    expect(r).toMatchObject({ total: 6, promoters: 2, passives: 2, detractors: 2, score: 0 });
  });
  it("da +100 con puros promotores y -100 con puros detractores", () => {
    expect(nps([9, 10, 10]).score).toBe(100);
    expect(nps([0, 3, 6]).score).toBe(-100);
  });
  it("devuelve null sin datos", () => {
    expect(nps([]).score).toBeNull();
  });
  it("redondea", () => {
    expect(nps([10, 10, 0]).score).toBe(33);
  });
});

describe("promedios y porcentajes", () => {
  it("average", () => {
    expect(average([1, 2, 3, 4])).toBe(2.5);
    expect(average([])).toBeNull();
  });
  it("percentTrue", () => {
    expect(percentTrue([true, false, true, true])).toBe(75);
    expect(percentTrue([])).toBeNull();
  });
  it("distribution rellena valores sin respuestas e ignora fuera de rango", () => {
    expect(distribution([1, 1, 5, 9], 1, 5)).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 0 },
      { value: 3, count: 0 },
      { value: 4, count: 0 },
      { value: 5, count: 1 },
    ]);
  });
  it("formatNps pone signo", () => {
    expect(formatNps(12)).toBe("+12");
    expect(formatNps(-5)).toBe("-5");
    expect(formatNps(null)).toBe("—");
  });
});

describe("bucketKey", () => {
  it("usa el día local de la zona horaria", () => {
    // 2026-09-30 03:00 UTC = 29 sep 21:00 en Ciudad de México
    expect(bucketKey(new Date("2026-09-30T03:00:00Z"), "day", "America/Mexico_City")).toBe("2026-09-29");
  });
  it("agrupa semanas desde el lunes", () => {
    // Miércoles 30 sep 2026 → lunes 28 sep
    expect(bucketKey(new Date("2026-09-30T18:00:00Z"), "week", "America/Mexico_City")).toBe("2026-09-28");
  });
});
