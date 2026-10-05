import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/db", () => ({ db: { execute } }));

const { GET } = await import("@/app/api/health/route");

describe("/api/health", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("responde ok sin tocar la base", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
    expect(execute).not.toHaveBeenCalled();
  });

  it("con ?db=1 consulta la base", async () => {
    execute.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/health?db=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("con ?db=1 responde 503 si la base no contesta", async () => {
    execute.mockRejectedValue(new Error("down"));
    const res = await GET(new Request("http://localhost/api/health?db=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", db: "unreachable" });
  });
});
