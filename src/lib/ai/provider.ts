import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

export const AI_PROVIDERS = ["groq", "google", "anthropic"] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

/** Default model per provider, used when AI_MODEL is empty. */
const DEFAULT_MODELS: Record<AIProviderName, string> = {
  groq: "openai/gpt-oss-120b",
  google: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5-5",
};

/** Env var that holds the key for each provider. */
const KEY_ENV: Record<AIProviderName, string> = {
  groq: "GROQ_API_KEY",
  google: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

type Env = Record<string, string | undefined>;

export type AIConfig =
  | { available: true; provider: AIProviderName; modelId: string }
  | {
      available: false;
      provider: AIProviderName | null;
      modelId: string | null;
      reason: "invalid_provider" | "missing_key";
    };

function isProvider(value: string): value is AIProviderName {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

/** Reads AI_PROVIDER / AI_MODEL / keys from env without exposing the keys. */
export function getAIConfig(env: Env = process.env): AIConfig {
  const raw = (env.AI_PROVIDER ?? "groq").trim().toLowerCase();
  if (!isProvider(raw)) {
    return { available: false, provider: null, modelId: null, reason: "invalid_provider" };
  }
  const modelId = env.AI_MODEL?.trim() || DEFAULT_MODELS[raw];
  if (!env[KEY_ENV[raw]]?.trim()) {
    return { available: false, provider: raw, modelId, reason: "missing_key" };
  }
  return { available: true, provider: raw, modelId };
}

/** Whether the key for each provider is present (booleans only). */
export function getAIKeyStatus(env: Env = process.env): Record<AIProviderName, boolean> {
  return {
    groq: Boolean(env.GROQ_API_KEY?.trim()),
    google: Boolean(env.GEMINI_API_KEY?.trim()),
    anthropic: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  };
}

/**
 * Returns the configured AI SDK model, or null when AI is unavailable.
 * Callers must handle null and fall back to the rule engine only
 * ("Análise por IA indisponível").
 */
export function getAIModel(env: Env = process.env): LanguageModel | null {
  const config = getAIConfig(env);
  if (!config.available) return null;

  switch (config.provider) {
    case "groq":
      return createGroq({ apiKey: env.GROQ_API_KEY })(config.modelId);
    case "google":
      // @ai-sdk/google looks for GOOGLE_GENERATIVE_AI_API_KEY by default;
      // this project uses GEMINI_API_KEY, so it is passed explicitly.
      return createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })(config.modelId);
    case "anthropic":
      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(config.modelId);
  }
}
