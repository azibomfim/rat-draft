import { describe, expect, it, vi } from "vitest";
import { TTLCache } from "./cache";

describe("TTLCache", () => {
  it("returns values until they expire", () => {
    let now = 1000;
    const c = new TTLCache(() => now);
    c.set("a", 1, 100);
    expect(c.get("a")).toBe(1);
    now = 1099;
    expect(c.get("a")).toBe(1);
    now = 1100;
    expect(c.get("a")).toBeUndefined();
  });

  it("loads once for concurrent calls and caches the result", async () => {
    const c = new TTLCache();
    const load = vi.fn(async () => "v");
    const [a, b] = await Promise.all([c.getOrLoad("k", 1000, load), c.getOrLoad("k", 1000, load)]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    await c.getOrLoad("k", 1000, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache errors", async () => {
    const c = new TTLCache();
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(c.getOrLoad("k", 1000, load)).rejects.toThrow("boom");
    await expect(c.getOrLoad("k", 1000, load)).resolves.toBe("ok");
  });
});
