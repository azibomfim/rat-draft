// Windows: a lowercase drive letter in the cwd ("c:\...") makes Vitest load
// itself twice ("failed to find the current suite"). Normalize, then run it.
import { pathToFileURL } from "node:url";

if (process.platform === "win32") {
  process.chdir(process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase()));
}
const root = process.cwd();
const cli = root + "/node_modules/vitest/vitest.mjs";
await import(pathToFileURL(cli).href);
