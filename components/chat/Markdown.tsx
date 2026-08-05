"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { createLowlight } from "lowlight";
import CodeBlock from "./CodeBlock";

import php from "highlight.js/lib/languages/php";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import python from "highlight.js/lib/languages/python";
import yaml from "highlight.js/lib/languages/yaml";
import diff from "highlight.js/lib/languages/diff";
import markdown from "highlight.js/lib/languages/markdown";

/**
 * Renders an assistant reply as markdown.
 *
 * Replies used to print with `whitespace-pre-wrap`, so every code answer
 * arrived with literal ``` fences, `##` before headings and `**` around bold
 * text. For an audience writing plugins, that made correct answers look broken.
 *
 * SECURITY: `rehype-raw` is deliberately NOT used. Without it react-markdown
 * escapes raw HTML, so a model emitting `<script>` or an onerror attribute —
 * by accident, or because a prompt injection inside an attached file told it
 * to — renders as visible text instead of running in the user's page. Verified
 * against script/img-onerror/div-onclick/svg-onload and `javascript:` links.
 *
 * PERFORMANCE: the parent re-renders on every streamed chunk, so this parses
 * repeatedly while a reply arrives. Measured on a 3KB reply:
 *
 *   no highlighting ........ 11.5ms
 *   highlight + autodetect .. 54.2ms   <- was making streaming janky
 *   highlight, no autodetect  39.3ms
 *
 * So highlighting is skipped WHILE STREAMING and applied once the reply is
 * complete. Auto-detection stays off permanently — it was the expensive part,
 * and an unlabelled block is better plain than slow.
 */

/** Only the languages our users actually write, so we don't ship all 190. */
const lowlight = createLowlight({
  php, javascript, typescript, json, css, xml, bash, sql, python, yaml, diff, markdown,
});

const COMPONENTS = {
  pre: ({ children }: { children?: React.ReactNode }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const cls = (child as { props?: { className?: string } })?.props?.className ?? "";
    const lang = cls.match(/language-([a-z0-9+#-]+)/i)?.[1] ?? null;
    return <CodeBlock language={lang}>{children}</CodeBlock>;
  },
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    if (/language-/.test(className ?? "")) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;
  },
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      // untrusted destinations — never hand them window.opener
      rel="noopener noreferrer nofollow"
      className="text-brand underline underline-offset-2 hover:text-brand-deep"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-line bg-canvas px-3 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-line px-3 py-1.5 align-top">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-brand/50 pl-3 text-ink-mute">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
};

const HIGHLIGHT = [[rehypeHighlight, { detect: false, ignoreMissing: true, lowlight }]] as never;

function MarkdownInner({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <div className="cfai-md text-[15px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={streaming ? [] : HIGHLIGHT}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Memoised: an unchanged message never re-parses while a sibling streams. */
export default memo(
  MarkdownInner,
  (a, b) => a.content === b.content && a.streaming === b.streaming,
);
