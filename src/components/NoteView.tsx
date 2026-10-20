// Read-only rendering of a rich note (board cards, Camp pins). Builds React elements from the
// whitelisted JSON only (never innerHTML), so notes can't inject anything.
import type { CSSProperties, ReactNode } from "react";
import "@fontsource/patrick-hand/400.css"; // the "Handwritten" note font (only downloaded when used)
import "../notes.css";
import { FONT_SIZES, HIGHLIGHTS, highlightColor, NOTE_FONTS, safeHref, TEXT_COLORS, textColor, type PMMark, type PMNode } from "../../shared/notedoc";
import { MediaImg } from "./Media";

const COLORS = new Set<string>(TEXT_COLORS.map(textColor));
const PENS = new Set<string>(HIGHLIGHTS.map(highlightColor));
const FONTS = new Set<string>(NOTE_FONTS.map((f) => f.css));
const SIZES = new Set<string>(FONT_SIZES.map((s) => s.id));
const ALIGN = new Set(["left", "center", "right", "justify"]);

function withMark(m: PMMark, child: ReactNode, key: number): ReactNode {
  const a = m.attrs ?? {};
  switch (m.type) {
    case "bold":
      return <strong key={key}>{child}</strong>;
    case "italic":
      return <em key={key}>{child}</em>;
    case "underline":
      return <u key={key}>{child}</u>;
    case "strike":
      return <s key={key}>{child}</s>;
    case "code":
      return <code key={key}>{child}</code>;
    case "link": {
      const href = safeHref(a.href);
      return href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
          {child}
        </a>
      ) : (
        child
      );
    }
    case "highlight":
      return (
        <mark key={key} style={{ background: PENS.has(String(a.color)) ? String(a.color) : highlightColor("yellow") }}>
          {child}
        </mark>
      );
    case "textStyle": {
      const style: CSSProperties = {};
      if (COLORS.has(String(a.color))) style.color = String(a.color);
      if (FONTS.has(String(a.fontFamily))) style.fontFamily = String(a.fontFamily);
      if (SIZES.has(String(a.fontSize))) style.fontSize = String(a.fontSize);
      return (
        <span key={key} style={style}>
          {child}
        </span>
      );
    }
    default:
      return child;
  }
}

/** No text and no picture inside (empty lines, bullets and checkboxes are left off cards). */
const blank = (n: PMNode): boolean => n.type !== "image" && n.type !== "horizontalRule" && !n.text && (n.content ?? []).every(blank);
const SKIP_BLANK = new Set(["paragraph", "heading", "listItem", "taskItem", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock"]);

function Block({ n, compact }: { n: PMNode; compact?: boolean }): ReactNode {
  if (compact && SKIP_BLANK.has(n.type) && blank(n)) return null;
  const kids = (n.content ?? []).map((c, i) => <Block key={i} n={c} compact={compact} />);
  const align = ALIGN.has(String(n.attrs?.textAlign)) ? { textAlign: n.attrs!.textAlign as CSSProperties["textAlign"] } : undefined;
  switch (n.type) {
    case "doc":
      return <>{kids}</>;
    case "text":
      return (n.marks ?? []).reduce<ReactNode>((acc, m, i) => withMark(m, acc, i), n.text ?? "");
    case "paragraph":
      if (!n.content?.length) return <p style={align}>{" "}</p>;
      return <p style={align}>{kids}</p>;
    case "heading": {
      const l = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1));
      const Tag = (["h3", "h4", "h5"] as const)[l - 1];
      return (
        <Tag className={`nh nh${l}`} style={align}>
          {kids}
        </Tag>
      );
    }
    case "hardBreak":
      return <br />;
    case "bulletList":
      return <ul>{kids}</ul>;
    case "orderedList":
      return <ol start={Number(n.attrs?.start) || undefined}>{kids}</ol>;
    case "listItem":
      return <li>{kids}</li>;
    case "taskList":
      return <ul className="task-list">{kids}</ul>;
    case "taskItem":
      return (
        <li className={`task-item ${n.attrs?.checked ? "done" : ""}`}>
          <span className="task-box" aria-hidden="true">
            {n.attrs?.checked ? "✓" : ""}
          </span>
          <div>{kids}</div>
        </li>
      );
    case "blockquote":
      return <blockquote>{kids}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{kids}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "table":
      return (
        <div className="table-wrap">
          <table>
            <tbody>{kids}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr>{kids}</tr>;
    case "tableHeader":
    case "tableCell": {
      const C = n.type === "tableHeader" ? "th" : "td";
      return (
        <C colSpan={Number(n.attrs?.colspan) || undefined} rowSpan={Number(n.attrs?.rowspan) || undefined}>
          {kids}
        </C>
      );
    }
    case "image":
      return Number(n.attrs?.media) ? (
        <figure className={`note-img size-${String(n.attrs?.size ?? "m")}`}>
          <MediaImg id={Number(n.attrs!.media)} fit="contain" />
        </figure>
      ) : null;
    default:
      return null;
  }
}

/** Renders a note doc. `compact` drops empty lines (for cards). */
export function NoteView({ doc, compact, className = "", font }: { doc: PMNode | null; compact?: boolean; className?: string; font?: string }) {
  if (!doc) return null;
  return (
    <div className={`note-rich ${compact ? "compact" : ""} font-${font ?? "quest"} ${className}`}>
      <Block n={doc} compact={compact} />
    </div>
  );
}
