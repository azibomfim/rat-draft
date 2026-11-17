import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown renderer for AI answers: headings (##, ###), bullet lists
 * (-, *), numbered lists and **bold**. Text is rendered as React text nodes,
 * never as HTML, so model output cannot inject markup.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      blocks.push(
        level <= 2 ? (
          <h3 key={blocks.length} className="mt-4 text-base font-semibold first:mt-0">
            {inline(heading[2])}
          </h3>
        ) : (
          <h4 key={blocks.length} className="mt-3 text-sm font-semibold">
            {inline(heading[2])}
          </h4>
        ),
      );
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (line.trim()) {
      flush();
      blocks.push(
        <p key={blocks.length} className="mt-2">
          {inline(line.trim())}
        </p>,
      );
    } else {
      flush();
    }
  }
  flush();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      if (part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
