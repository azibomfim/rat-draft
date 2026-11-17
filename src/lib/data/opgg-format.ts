/**
 * Parser for the compact text format the OP.GG MCP returns when
 * `desired_output_fields` is used:
 *
 *   class Summoner: game_name,tagline,league_stats
 *   class LeagueStat: game_type,win
 *
 *   Root(Summoner("Robo","ROBS",[LeagueStat("SOLORANKED",660)]))
 *   OP.GG page: https://...
 *
 * `class` lines declare the field order of each constructor; the body is a
 * nested expression of constructors, lists, strings, numbers, booleans and
 * null. Output is plain JSON-like objects keyed by the declared field names.
 * If the server ever returns JSON instead, it is parsed as JSON.
 */

export type OpggValue =
  | string
  | number
  | boolean
  | null
  | OpggValue[]
  | { [key: string]: OpggValue };

export class OpggFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpggFormatError";
  }
}

export function parseOpggText(text: string): OpggValue {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as OpggValue;
    } catch {
      // fall through to the class format (JSON may be followed by extra lines)
      const jsonEnd = findJsonEnd(trimmed);
      if (jsonEnd > 0) return JSON.parse(trimmed.slice(0, jsonEnd)) as OpggValue;
    }
  }

  const classes = new Map<string, string[]>();
  const bodyLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^class\s+(\w+)\s*:\s*(.*)$/.exec(line.trim());
    if (m) {
      classes.set(m[1], m[2].split(",").map((f) => f.trim()).filter(Boolean));
    } else if (line.trim()) {
      bodyLines.push(line);
    }
  }
  // The body is the first non-class line that starts with a constructor/list.
  const body = bodyLines.find((l) => /^\s*(\w+\(|\[)/.test(l));
  if (!body) throw new OpggFormatError("No data expression found in OP.GG response");
  return new ExprParser(body.trim(), classes).parse();
}

function findJsonEnd(s: string): number {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

class ExprParser {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly classes: Map<string, string[]>,
  ) {}

  parse(): OpggValue {
    const value = this.value();
    this.ws();
    return value;
  }

  private ws() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  private fail(msg: string): never {
    throw new OpggFormatError(`${msg} at position ${this.pos}`);
  }

  private value(): OpggValue {
    this.ws();
    const ch = this.src[this.pos];
    if (ch === '"' || ch === "'") return this.string(ch);
    if (ch === "[") return this.list();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.number();
    const ident = /^[A-Za-z_]\w*/.exec(this.src.slice(this.pos));
    if (!ident) this.fail(`Unexpected character "${ch ?? "EOF"}"`);
    const name = ident[0];
    this.pos += name.length;
    if (name === "null" || name === "None") return null;
    if (name === "true" || name === "True") return true;
    if (name === "false" || name === "False") return false;
    this.ws();
    if (this.src[this.pos] !== "(") this.fail(`Expected "(" after ${name}`);
    return this.constructorCall(name);
  }

  private constructorCall(name: string): OpggValue {
    this.pos++; // (
    const args: OpggValue[] = [];
    this.ws();
    while (this.src[this.pos] !== ")") {
      args.push(this.value());
      this.ws();
      if (this.src[this.pos] === ",") this.pos++;
      else if (this.src[this.pos] !== ")") this.fail(`Expected "," or ")" in ${name}`);
      this.ws();
    }
    this.pos++; // )
    const fields = this.classes.get(name);
    if (!fields) return args.length === 1 ? args[0] : args;
    const obj: Record<string, OpggValue> = {};
    fields.forEach((field, i) => {
      obj[field] = i < args.length ? args[i] : null;
    });
    return obj;
  }

  private list(): OpggValue[] {
    this.pos++; // [
    const items: OpggValue[] = [];
    this.ws();
    while (this.src[this.pos] !== "]") {
      items.push(this.value());
      this.ws();
      if (this.src[this.pos] === ",") this.pos++;
      else if (this.src[this.pos] !== "]") this.fail('Expected "," or "]" in list');
      this.ws();
    }
    this.pos++; // ]
    return items;
  }

  private number(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos));
    if (!m) this.fail("Invalid number");
    this.pos += m[0].length;
    return Number(m[0]);
  }

  private string(quote: string): string {
    this.pos++;
    let out = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === "\\") {
        const next = this.src[this.pos + 1];
        if (next === "u") {
          out += String.fromCharCode(parseInt(this.src.slice(this.pos + 2, this.pos + 6), 16));
          this.pos += 6;
          continue;
        }
        const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r" };
        out += escapes[next] ?? next;
        this.pos += 2;
        continue;
      }
      if (ch === quote) {
        this.pos++;
        return out;
      }
      out += ch;
      this.pos++;
    }
    this.fail("Unterminated string");
  }
}

/* Small typed accessors for parsed values. */

export function asObject(v: OpggValue | undefined): Record<string, OpggValue> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}

export function asArray(v: OpggValue | undefined): OpggValue[] {
  return Array.isArray(v) ? v : [];
}

export function asNumber(v: OpggValue | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function asString(v: OpggValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Follows a dotted path through nested objects: get(root, "data.summoner"). */
export function getPath(v: OpggValue | undefined, path: string): OpggValue | undefined {
  let cur: OpggValue | undefined = v;
  for (const key of path.split(".")) {
    const obj = asObject(cur);
    if (!obj) return undefined;
    cur = obj[key];
  }
  return cur;
}
