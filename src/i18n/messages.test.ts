import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([k, v]) =>
      typeof v === "string" ? [[`${prefix}${k}`, v]] : Object.entries(flatten(v, `${prefix}${k}.`)),
    ),
  );
}

/** Top-level ICU arguments: {name}, {count, plural, ...} → name, count. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    if (message[i] === "{") {
      if (depth === 0) {
        const m = /^\{\s*(\w+)/.exec(message.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (message[i] === "}") depth--;
  }
  return [...names].sort();
}

const ptFlat = flatten(pt as Tree);
const enFlat = flatten(en as Tree);

describe("messages", () => {
  it("PT and EN have exactly the same keys", () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(ptFlat).sort());
  });

  it("no message is empty", () => {
    for (const [k, v] of Object.entries({ ...ptFlat, ...enFlat })) expect(v.trim(), k).not.toBe("");
  });

  it("each message uses the same placeholders in both languages", () => {
    for (const key of Object.keys(ptFlat)) {
      expect(placeholders(enFlat[key] ?? ""), key).toEqual(placeholders(ptFlat[key]));
    }
  });
});
