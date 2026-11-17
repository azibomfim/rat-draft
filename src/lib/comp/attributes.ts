/**
 * Draft attributes of each champion (seção 6), maintained by the project in
 * data/champion-attributes.json. Parsed with zod when this module loads, so an
 * invalid file breaks the build with a clear message.
 */
import { z } from "zod";
import raw from "../../../data/champion-attributes.json";
import { ROLES } from "../data/types";

export const ATTRIBUTE_KEYS = [
  "engage",
  "disengage",
  "peel",
  "cc",
  "frontline",
  "poke",
  "waveclear",
  "splitpush",
  "mobility",
  "objectiveControl",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const CHAMPION_TAGS = [
  "engage",
  "dive",
  "poke",
  "pick",
  "protect",
  "splitpush",
  "teamfight",
  "skirmish",
  "burst",
  "tank",
  "enchanter",
  "hypercarry",
  "roam",
  "zone",
  "antitank",
] as const;
export type ChampionTag = (typeof CHAMPION_TAGS)[number];

const score = z.number().int().min(0).max(3);

export const ChampionAttributesSchema = z
  .object({
    roles: z.array(z.enum(ROLES)).min(1),
    damageType: z.enum(["AD", "AP", "mixed"]),
    damageProfile: z.enum(["burst", "sustained", "mixed"]),
    range: z.enum(["melee", "ranged"]),
    scaling: z.enum(["early", "mid", "late"]),
    engage: score,
    disengage: score,
    peel: score,
    cc: score,
    frontline: score,
    poke: score,
    waveclear: score,
    splitpush: score,
    mobility: score,
    objectiveControl: score,
    tags: z.array(z.enum(CHAMPION_TAGS)),
    /** Marked when the values are a best guess and should be reviewed. */
    review: z.boolean().optional(),
  })
  .strict();

export type ChampionAttributes = z.infer<typeof ChampionAttributesSchema>;

export const ChampionAttributesFileSchema = z.record(z.string().regex(/^[A-Za-z]+$/), ChampionAttributesSchema);

function parseFile(data: unknown): Record<string, ChampionAttributes> {
  const result = ChampionAttributesFileSchema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues
      .slice(0, 20)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`data/champion-attributes.json is invalid:\n${lines}`);
  }
  return result.data;
}

export const championAttributes: Readonly<Record<string, ChampionAttributes>> = parseFile(raw);

export function getAttributes(championId: string): ChampionAttributes | undefined {
  return championAttributes[championId];
}

/** Ids with attributes, for the sync script and tests. */
export function attributeIds(): string[] {
  return Object.keys(championAttributes);
}

export { parseFile as parseChampionAttributesFile };
