import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../Icon";
import type { Theme } from "../../theme";
import { snappy } from "../../motion";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number | string;
  className?: string;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  theme,
  title,
  children,
  footer,
  maxWidth = 480,
  className = "",
  showCloseButton = true,
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <motion.div
            className={`modal-container ${className}`}
            style={{
              background: theme.card,
              borderColor: theme.border,
              color: theme.foreground,
              maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
            }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={snappy}
          >
            {title && (
              <div className="modal-header">
                <div className="modal-header-left">
                  {typeof title === "string" ? (
                    <h2 className="modal-title" style={{ color: theme.foreground }}>
                      {title}
                    </h2>
                  ) : (
                    title
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={onClose}
                    aria-label="Close modal"
                  >
                    <Icon name="x" size={13} color={theme.foreground} />
                  </button>
                )}
              </div>
            )}

            <div className="modal-body">{children}</div>

            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
