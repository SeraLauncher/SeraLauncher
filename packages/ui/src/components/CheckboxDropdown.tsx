import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { snappy } from "../motion";
import { Icon } from "./Icon";
import type { Theme } from "../theme";

/**
 * Multi-select dropdown styled 1:1 with Dropdown.tsx, featuring checkboxes on the left of each item.
 */
export function CheckboxDropdown<T extends string>({
  values,
  options,
  render,
  renderTrigger,
  onChange,
  theme,
  className = "",
}: {
  values: readonly T[];
  options: readonly T[];
  /** How one option reads in the list */
  render: (option: T) => string;
  /** Custom summary rendered on the closed trigger button */
  renderTrigger?: (selected: readonly T[]) => string;
  onChange: (values: T[]) => void;
  theme: Theme;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const toggle = (option: T) => {
    const isChecked = values.includes(option);
    if (isChecked) {
      if (values.length <= 1) return; // Keep at least one checked
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setCursor((prev) => (prev + step + options.length) % Math.max(1, options.length));
      if (!open) setOpen(true);
      return;
    }
    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const option = options[cursor];
      if (option !== undefined) {
        toggle(option);
      }
    }
  };

  const triggerLabel = renderTrigger
    ? renderTrigger(values)
    : values.length === options.length
      ? `All enabled (${options.length})`
      : `${values.length} enabled`;

  return (
    <div
      ref={root}
      className={`relative min-w-[200px] border-0 rounded-lg bg-secondary text-sm ${className}`}
      onKeyDown={onKeyDown}
      style={{ border: 0, background: theme.secondary }}
    >
      <motion.button
        type="button"
        className="flex items-center justify-between gap-2.5 w-full px-2.5 py-[7px] border-0 text-sm font-medium text-left cursor-pointer bg-transparent select-none"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ color: theme.foreground }}
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
          {triggerLabel}
        </span>
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.mutedForeground}
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
            className="absolute top-[calc(100%+4px)] inset-x-0 z-50 flex flex-col p-1 border-0 rounded-lg bg-secondary shadow-[0_8px_24px_rgba(0,0,0,0.25)] [&>ul]:max-h-[240px] [&>ul]:m-0 [&>ul]:p-0 [&>ul]:overflow-y-auto [&>ul]:list-none"
            style={{ background: theme.secondary, border: 0 }}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -3 }}
            transition={snappy}
          >
            <ul role="listbox">
              {options.map((option, index) => {
                const isChecked = values.includes(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isChecked}
                      onClick={() => toggle(option)}
                      onPointerEnter={() => setCursor(index)}
                      className="flex items-center gap-2.5 w-full px-2.5 py-[7px] border-0 rounded-md text-sm font-medium text-left cursor-pointer transition-colors select-none"
                      style={{
                        color: isChecked ? theme.foreground : theme.mutedForeground,
                        background: index === cursor ? theme.card : "transparent",
                      }}
                    >
                      <div
                        className="size-4 rounded flex items-center justify-center border transition-colors shrink-0"
                        style={{
                          borderColor: isChecked ? theme.primary : theme.border,
                          background: isChecked ? theme.primary : "transparent",
                        }}
                      >
                        {isChecked && (
                          <Icon name="check" size={10} color={theme.primaryForeground} />
                        )}
                      </div>
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                        {render(option)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
