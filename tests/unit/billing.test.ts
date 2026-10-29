import { describe, expect, it } from "vitest";
import { billingStatus, formatPeriod, isValidPeriod, parseMoney, shiftPeriod } from "@/lib/billing";

const base = { billingDay: 5, createdDay: "2026-01-10", paidPeriods: new Set<string>() };

describe("billingStatus", () => {
  it("pagado si hay un pago de ese mes", () => {
    expect(billingStatus({ ...base, period: "2026-10", today: "2026-10-20", paidPeriods: new Set(["2026-10"]) })).toBe("PAID");
  });
  it("pendiente hasta el día de corte, vencido después", () => {
    expect(billingStatus({ ...base, period: "2026-10", today: "2026-10-05" })).toBe("PENDING");
    expect(billingStatus({ ...base, period: "2026-10", today: "2026-10-06" })).toBe("OVERDUE");
  });
  it("un mes anterior sin pago está vencido", () => {
    expect(billingStatus({ ...base, period: "2026-09", today: "2026-10-01" })).toBe("OVERDUE");
  });
  it("el mes de alta después del corte queda pendiente", () => {
    expect(billingStatus({ ...base, createdDay: "2026-10-20", period: "2026-10", today: "2026-10-28" })).toBe("PENDING");
    expect(billingStatus({ ...base, createdDay: "2026-10-02", period: "2026-10", today: "2026-10-28" })).toBe("OVERDUE");
  });
  it("antes de darse de alta no debe nada", () => {
    expect(billingStatus({ ...base, createdDay: "2026-10-02", period: "2026-08", today: "2026-10-28" })).toBe("PENDING");
  });
});

describe("dinero y periodos", () => {
  it("parseMoney acepta comas y centavos", () => {
    expect(parseMoney("1,250.50")).toBe(125050);
    expect(parseMoney("$999")).toBe(99900);
    expect(parseMoney("0")).toBeNull();
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("periodos", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidPeriod("2026-10")).toBe(true);
    expect(formatPeriod("2026-10")).toBe("octubre de 2026");
  });
});
