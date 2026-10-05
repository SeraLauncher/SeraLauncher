import React, { useMemo } from "react";
import { marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Theme } from "../theme";

interface SafeContentRendererProps {
  content: string;
  type: "markdown" | "html";
  theme: Theme;
  className?: string;
}

function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  e.preventDefault();
  if (href.startsWith("http://") || href.startsWith("https://")) {
    openUrl(href).catch(() => {
      window.open(href, "_blank", "noopener,noreferrer");
    });
  }
}

/**
 * Safely parses Markdown or HTML into native React elements without dangerouslySetInnerHTML.
 * Uses marked for standard GFM compliance (headings, tables, task lists, code, blockquotes),
 * strips script tags, and routes links safely through Tauri's desktop opener.
 */
export function SafeContentRenderer({
  content,
  type,
  theme,
  className = "",
}: SafeContentRendererProps) {
  const renderedElements = useMemo(() => {
    if (!content || !content.trim()) return null;

    let htmlString = content;
    if (type === "markdown") {
      try {
        const parsed = marked.parse(content, { gfm: true, breaks: false });
        htmlString = typeof parsed === "string" ? parsed : content;
      } catch {
        htmlString = content;
      }
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, "text/html");

      let keyCounter = 0;
      function convertNode(node: Node): React.ReactNode {
        keyCounter++;
        const currentKey = `node-${keyCounter}`;

        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return null;
        }

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // Reject unsafe tags
        if (["script", "iframe", "object", "embed", "form", "input", "button"].includes(tagName)) {
          return null;
        }

        const children = Array.from(el.childNodes).map(convertNode).filter(Boolean);

        // Safe anchor links opening externally
        if (tagName === "a") {
          const href = el.getAttribute("href") || "#";
          const hasOnlyImg =
            el.childNodes.length === 1 && el.childNodes[0].nodeName.toLowerCase() === "img";
          return (
            <a
              key={currentKey}
              href={href}
              onClick={(e) => handleLinkClick(e, href)}
              className={
                hasOnlyImg
                  ? "inline-block align-middle my-1 mr-1.5 hover:opacity-90 transition-opacity cursor-pointer leading-none"
                  : "text-primary underline hover:opacity-85 font-medium inline-flex items-center gap-0.5 cursor-pointer"
              }
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          );
        }

        // Safe images
        if (tagName === "img") {
          const src = el.getAttribute("src") || "";
          const alt = el.getAttribute("alt") || "";
          if (
            !src.startsWith("http://") &&
            !src.startsWith("https://") &&
            !src.startsWith("data:image/")
          ) {
            return null;
          }
          return (
            <img
              key={currentKey}
              src={src}
              alt={alt}
              loading="lazy"
              className="max-w-full h-auto rounded-lg my-1 mr-1.5 inline-block align-middle object-contain"
            />
          );
        }

        // Headings
        if (tagName === "h1") {
          return (
            <h1
              key={currentKey}
              className="text-xl font-bold mt-5 mb-2.5 tracking-tight border-b border-border/50 pb-1.5"
              style={{ color: theme.foreground }}
            >
              {children}
            </h1>
          );
        }
        if (tagName === "h2") {
          return (
            <h2
              key={currentKey}
              className="text-lg font-bold mt-4 mb-2 tracking-tight border-b border-border/40 pb-1"
              style={{ color: theme.foreground }}
            >
              {children}
            </h2>
          );
        }
        if (tagName === "h3") {
          return (
            <h3
              key={currentKey}
              className="text-base font-semibold mt-3 mb-1.5"
              style={{ color: theme.foreground }}
            >
              {children}
            </h3>
          );
        }
        if (["h4", "h5", "h6"].includes(tagName)) {
          return (
            <h4
              key={currentKey}
              className="text-sm font-semibold mt-2.5 mb-1"
              style={{ color: theme.foreground }}
            >
              {children}
            </h4>
          );
        }

        // Paragraphs
        if (tagName === "p") {
          return (
            <p
              key={currentKey}
              className="text-xs leading-relaxed my-2"
              style={{ color: theme.foreground }}
            >
              {children}
            </p>
          );
        }

        // Blockquotes
        if (tagName === "blockquote") {
          return (
            <blockquote
              key={currentKey}
              className="border-l-3 border-primary pl-3.5 my-3 text-xs italic"
              style={{ color: theme.mutedForeground }}
            >
              {children}
            </blockquote>
          );
        }

        // Lists
        if (tagName === "ul") {
          return (
            <ul key={currentKey} className="list-disc list-inside my-2 flex flex-col gap-1 text-xs">
              {children}
            </ul>
          );
        }
        if (tagName === "ol") {
          return (
            <ol
              key={currentKey}
              className="list-decimal list-inside my-2 flex flex-col gap-1 text-xs"
            >
              {children}
            </ol>
          );
        }
        if (tagName === "li") {
          return (
            <li key={currentKey} className="leading-relaxed" style={{ color: theme.foreground }}>
              {children}
            </li>
          );
        }

        // Tables (GFM)
        if (tagName === "table") {
          return (
            <div
              key={currentKey}
              className="w-full overflow-x-auto my-3 rounded-lg border border-border"
            >
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          );
        }
        if (tagName === "thead") {
          return (
            <thead
              key={currentKey}
              className="border-b border-border font-semibold bg-secondary/50"
            >
              {children}
            </thead>
          );
        }
        if (tagName === "tbody") {
          return (
            <tbody key={currentKey} className="divide-y divide-border/40">
              {children}
            </tbody>
          );
        }
        if (tagName === "tr") {
          return (
            <tr key={currentKey} className="transition-colors hover:bg-secondary/30">
              {children}
            </tr>
          );
        }
        if (tagName === "th") {
          return (
            <th
              key={currentKey}
              className="p-2.5 text-xs font-semibold"
              style={{ color: theme.foreground }}
            >
              {children}
            </th>
          );
        }
        if (tagName === "td") {
          return (
            <td key={currentKey} className="p-2.5 text-xs" style={{ color: theme.foreground }}>
              {children}
            </td>
          );
        }

        // Pre / Code
        if (tagName === "pre") {
          return (
            <pre
              key={currentKey}
              className="p-3 my-3 rounded-lg border border-border bg-secondary font-mono text-xs overflow-x-auto select-text leading-relaxed"
              style={{ color: theme.foreground }}
            >
              {children}
            </pre>
          );
        }
        if (tagName === "code") {
          return (
            <code
              key={currentKey}
              className="px-1.5 py-0.5 rounded bg-secondary font-mono text-[11px] border border-border/50"
              style={{ color: theme.foreground }}
            >
              {children}
            </code>
          );
        }

        // Formatting modifiers
        if (tagName === "strong" || tagName === "b") {
          return (
            <strong key={currentKey} className="font-semibold text-foreground">
              {children}
            </strong>
          );
        }
        if (tagName === "em" || tagName === "i") {
          return (
            <em key={currentKey} className="italic text-foreground">
              {children}
            </em>
          );
        }
        if (tagName === "del" || tagName === "s") {
          return (
            <del key={currentKey} className="line-through opacity-70">
              {children}
            </del>
          );
        }

        // Line break & horizontal rule
        if (tagName === "br") return <br key={currentKey} />;
        if (tagName === "hr") {
          return <hr key={currentKey} className="my-4 border-t border-border" />;
        }

        // Generic text container
        return (
          <span key={currentKey} style={{ color: "inherit" }}>
            {children}
          </span>
        );
      }

      return Array.from(doc.body.childNodes).map(convertNode).filter(Boolean);
    } catch {
      return (
        <p className="text-xs leading-relaxed" style={{ color: theme.foreground }}>
          {content}
        </p>
      );
    }
  }, [content, type, theme]);

  return (
    <div className={`w-full overflow-hidden select-text ${className}`}>{renderedElements}</div>
  );
}
