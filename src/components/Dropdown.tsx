import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { snappy } from "../motion";
import type { Theme } from "../theme";

/** Themed dropdown. A native `<select>` draws its popup with the platform's own
 *  widget, outside this document, so it cannot pick up the palette; this renders the
 *  list ourselves and keeps the keyboard behaviour. */
export function Dropdown<T extends string | number>({
  value,
  options,
  render,
  onChange,
  theme,
  className,
  searchPlaceholder,
}: {
  value: T;
  options: readonly T[];
  /** how one option reads, both in the list and on the closed trigger */
  render: (option: T) => string;
  onChange: (option: T) => void;
  theme: Theme;
  className?: string;
  /** set only where the list is long enough to be worth filtering */
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(() => Math.max(0, options.indexOf(value)));
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // the filter lives here rather than in the caller, so every searchable dropdown
  // gets it for free
  const shown = useMemo(() => {
    if (!searchPlaceholder) return options;
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => render(option).toLowerCase().includes(needle));
  }, [options, query, render, searchPlaceholder]);

  useEffect(() => {
    if (!open) return;
    // pointerdown outside closes; a click on the trigger is handled by the button
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // typing only makes sense with the box open, and the caret belongs there
  useEffect(() => {
    if (open && searchPlaceholder) search.current?.focus();
  }, [open, searchPlaceholder]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (option: T) => {
    onChange(option);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const from = open ? cursor : Math.max(0, options.indexOf(value));
      setCursor((from + step + Math.max(1, shown.length)) % Math.max(1, shown.length));
      if (!open) setOpen(true);
      return;
    }
    // space and enter belong to the search field when it has focus
    const typing = event.target instanceof HTMLInputElement;
    if (!typing && open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const option = shown[cursor];
      if (option !== undefined) pick(option);
    }
  };

  return (
    <div
      ref={root}
      className={`dropdown ${className ?? ""}`}
      onKeyDown={onKeyDown}
      style={{ borderColor: theme.raised, background: theme.background }}
    >
      <motion.button
        type="button"
        className="dropdown-trigger"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ color: theme.text }}
        whileTap={{ scale: 0.985 }}
        transition={snappy}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {render(value)}
        </span>
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.muted}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
          animate={{ rotate: open ? 180 : 0 }}
          transition={snappy}
        >
          <path d="M6 9l6 6l6 -6" />
        </motion.svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="list"
            className="dropdown-list"
            style={{ background: theme.background, borderColor: theme.raised }}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -3 }}
            transition={snappy}
          >
            {searchPlaceholder && (
              <input
                ref={search}
                className="dropdown-search"
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // the filter just reshuffled the list under the cursor
                  setCursor(0);
                }}
                style={{ color: theme.text, background: theme.shell }}
              />
            )}

            <ul role="listbox">
              {shown.map((option, index) => (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option === value}
                    onClick={() => pick(option)}
                    onPointerEnter={() => setCursor(index)}
                    className="dropdown-option"
                    style={{
                      color: option === value ? theme.accent : theme.text,
                      background: index === cursor ? theme.raised : "transparent",
                    }}
                  >
                    {render(option)}
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="dropdown-empty" style={{ color: theme.faint }}>
                  No match
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
