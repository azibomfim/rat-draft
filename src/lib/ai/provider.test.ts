import { describe, expect, it } from "vitest";
import { getAIConfig, getAIKeyStatus, getAIModel } from "./provider";

describe("AI provider", () => {
  it("is unavailable when the selected provider has no key", () => {
    const env = { AI_PROVIDER: "groq", AI_MODEL: "llama-3.3-70b-versatile" };
    expect(getAIConfig(env)).toEqual({
      available: false,
      provider: "groq",
      modelId: "llama-3.3-70b-versatile",
      reason: "missing_key",
    });
    expect(getAIModel(env)).toBeNull();
  });

  it("rejects unknown providers", () => {
    expect(getAIConfig({ AI_PROVIDER: "openai" })).toMatchObject({ available: false, reason: "invalid_provider" });
  });

  it("uses GEMINI_API_KEY for google and a default model", () => {
    const env = { AI_PROVIDER: "google", GEMINI_API_KEY: "x" };
    const config = getAIConfig(env);
    expect(config.available).toBe(true);
    expect(config.modelId).toBeTruthy();
    expect(getAIModel(env)).not.toBeNull();
  });

  it("reports key presence as booleans only", () => {
    const status = getAIKeyStatus({ GROQ_API_KEY: "secret", ANTHROPIC_API_KEY: " " });
    expect(status).toEqual({ groq: true, google: false, anthropic: false });
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
