/**
 * Lists the real tools exposed by the OP.GG MCP server and saves them to
 * docs/opgg-tools.json. Run with: npm run opgg:tools
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { closeOpgg, getOpggUrl, listOpggTools } from "../src/lib/data/opgg";

async function main() {
  const tools = await listOpggTools();
  tools.sort((a, b) => a.name.localeCompare(b.name));

  const out = path.join(process.cwd(), "docs", "opgg-tools.json");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify({ server: getOpggUrl(), fetchedAt: new Date().toISOString(), tools }, null, 2) + "\n",
    "utf8",
  );

  console.log(`Saved ${tools.length} tools to ${path.relative(process.cwd(), out)}:`);
  for (const t of tools) console.log(`  - ${t.name}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpgg());
