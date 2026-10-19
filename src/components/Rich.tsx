// Safe mini-markdown for notes: **bold**, *italic*, "- " lists, [text](https://…) and bare links.
// Builds React elements only (never innerHTML), so notes can't inject anything.
import { Fragment, type ReactNode } from "react";

const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>()]+)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith("*")) out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]("));
      const href = t.slice(t.indexOf("](") + 2, -1);
      out.push(
        <a key={k++} href={href} target="_blank" rel="noopener noreferrer nofollow">
          {label}
        </a>,
      );
    } else
      out.push(
        <a key={k++} href={t} target="_blank" rel="noopener noreferrer nofollow">
          {t.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
        </a>,
      );
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={`rich ${className}`}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
