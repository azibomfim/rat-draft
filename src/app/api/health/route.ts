import { connection } from "next/server";
import { getAIConfig, getAIKeyStatus } from "@/lib/ai/provider";
import { getOpggUrl } from "@/lib/data/opgg";

/** Reports which services are configured. Never returns key values. */
export async function GET() {
  // Read env at request time, not at build time (would be prerendered otherwise).
  await connection();
  const ai = getAIConfig();
  return Response.json({
    status: "ok",
    ai: {
      available: ai.available,
      provider: ai.provider,
      model: ai.modelId,
      ...(ai.available ? {} : { reason: ai.reason }),
      keys: getAIKeyStatus(),
    },
    opgg: { url: getOpggUrl() },
    riot: { configured: Boolean(process.env.RIOT_API_KEY?.trim()) },
    region: process.env.DEFAULT_REGION?.trim() || "br",
  });
}
