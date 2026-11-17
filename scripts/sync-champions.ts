/**
 * Compares data/champion-attributes.json with the current Data Dragon list.
 *
 *   npm run champions:sync            → report (exit 0)
 *   npm run champions:sync -- --strict → exit 1 if a champion has no attributes
 *                                        (runs before `next build`)
 *
 * Field validation (types, 0–3 scale, tags) happens in src/lib/comp/attributes.ts
 * via zod; importing it here fails fast with a clear message.
 * If Data Dragon is unreachable the check is skipped with a warning, so an
 * offline build still validates the fields.
 */
import { attributeIds, championAttributes } from "../src/lib/comp/attributes";
import { getChampions, getLatestVersion } from "../src/lib/data/ddragon";

const strict = process.argv.includes("--strict");

async function main() {
  let version: string;
  let champions: { id: string; name: string }[];
  try {
    [version, champions] = await Promise.all([getLatestVersion(), getChampions("en")]);
  } catch (err) {
    console.warn(`[sync-champions] Data Dragon unreachable, skipping the champion list check: ${String(err)}`);
    return;
  }

  const known = new Set(attributeIds());
  const live = new Set(champions.map((c) => c.id));
  const missing = champions.filter((c) => !known.has(c.id));
  const extra = [...known].filter((id) => !live.has(id));
  const review = Object.entries(championAttributes)
    .filter(([, a]) => a.review)
    .map(([id]) => id);

  console.log(`[sync-champions] Data Dragon ${version}: ${champions.length} champions, ${known.size} with attributes.`);
  if (review.length) console.log(`[sync-champions] Marked for review (${review.length}): ${review.join(", ")}`);
  if (extra.length) console.warn(`[sync-champions] In the file but not in Data Dragon: ${extra.join(", ")}`);

  if (missing.length) {
    const list = missing.map((c) => `${c.id} (${c.name})`).join(", ");
    const msg = `[sync-champions] Champions WITHOUT attributes: ${list}\n  → add them to data/champion-attributes.json (see docs/TASKS.md, seção 6).`;
    if (strict) {
      console.error(msg);
      process.exitCode = 1;
    } else {
      console.warn(msg);
    }
  } else {
    console.log("[sync-champions] All champions have attributes.");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
