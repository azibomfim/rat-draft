import { describe, expect, it } from "vitest";
import { DataSourceError, withTimeout } from "./errors";

describe("withTimeout", () => {
  it("resolves when the promise is fast enough", async () => {
    await expect(withTimeout(Promise.resolve(42), "opgg", 50)).resolves.toBe(42);
  });

  it("rejects with a typed timeout error", async () => {
    const slow = new Promise((r) => setTimeout(r, 200));
    const err = await withTimeout(slow, "opgg", 10).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataSourceError);
    expect((err as DataSourceError).code).toBe("timeout");
    expect((err as DataSourceError).source).toBe("opgg");
  });
});
