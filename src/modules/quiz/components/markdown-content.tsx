import type { ReactNode } from "react";

function inlineMarkdown(source: string, keyPrefix: string): ReactNode[] {
  const parts = source.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function linesWithBreaks(lines: string[], keyPrefix: string) {
  return lines.map((line, index) => (
    <span key={`${keyPrefix}-${index}`}>
      {inlineMarkdown(line, `${keyPrefix}-${index}`)}
      {index < lines.length - 1 && <br />}
    </span>
  ));
}

export function MarkdownContent({ children }: { children: string }) {
  const lines = children.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(lines[index])) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {linesWithBreaks(quoteLines, `quote-${index}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*-\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*-\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`list-${index}-${itemIndex}`}>
              {inlineMarkdown(item, `list-${index}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^\s*-\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {linesWithBreaks(paragraphLines, `paragraph-${index}`)}
      </p>,
    );
  }

  return <div className="quiz-markdown">{blocks}</div>;
}
