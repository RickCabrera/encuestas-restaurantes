import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("acepta 10 dígitos con espacios, guiones o paréntesis", () => {
    expect(normalizePhone("5512345678")).toBe("5512345678");
    expect(normalizePhone("55 1234 5678")).toBe("5512345678");
    expect(normalizePhone("(55) 1234-5678")).toBe("5512345678");
  });

  it("quita la lada de país +52 y el 1 antiguo", () => {
    expect(normalizePhone("+52 55 1234 5678")).toBe("5512345678");
    expect(normalizePhone("525512345678")).toBe("5512345678");
    expect(normalizePhone("+52 1 55 1234 5678")).toBe("5512345678");
  });

  it("rechaza lo que no es un celular", () => {
    for (const bad of ["", null, undefined, "123", "55123456789", "0512345678", "5555555555", "0000000000", "abc"]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});

describe("formato", () => {
  it("agrupa y enmascara", () => {
    expect(formatPhone("5512345678")).toBe("55 1234 5678");
    expect(maskPhone("5512345678")).toBe("•• •••• 5678");
  });
});
