import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { LICENSE_DAYS, signLicense, verifyLicense } from "@/lib/license-token";

const claims = { installationId: "11111111-1111-4111-8111-111111111111", organizationId: "org-1", organizationName: "Tacos" };

describe("licencias de PC", () => {
  it("una licencia firmada por la nube se verifica y vence en 7 días", async () => {
    const token = await signLicense(claims);
    const c = await verifyLicense(token);
    expect(c).toMatchObject(claims);
    const days = (c!.expiresAt.getTime() - c!.issuedAt.getTime()) / 86_400_000;
    expect(days).toBe(LICENSE_DAYS);
  });

  it("rechaza una licencia alterada", async () => {
    const token = await signLicense(claims);
    const [h, p, s] = token.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    payload.org = "otra";
    const forged = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
    expect(await verifyLicense(forged)).toBeNull();
  });

  it("rechaza una licencia firmada con otra llave", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const token = await new SignJWT({ org: "x", orgName: "x" })
      .setProtectedHeader({ alg: "EdDSA" })
      .setSubject("y")
      .setIssuer("sobremesa")
      .setAudience("sobremesa-pc")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(privateKey);
    expect(await verifyLicense(token)).toBeNull();
  });

  it("rechaza vacías y basura", async () => {
    expect(await verifyLicense(null)).toBeNull();
    expect(await verifyLicense("abc.def.ghi")).toBeNull();
  });
});
