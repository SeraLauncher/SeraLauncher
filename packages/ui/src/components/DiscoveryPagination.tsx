import { useState } from "react";
import { Icon } from "./Icon";
import type { Theme } from "../theme";

interface DiscoveryPaginationProps {
  page: number;
  totalHits: number;
  limit: number;
  loading?: boolean;
  itemLabel?: string;
  theme: Theme;
  onPageChange: (newPage: number) => void;
  onScrollToTop?: () => void;
  updatesAvailable?: number;
}

export function DiscoveryPagination({
  page,
  totalHits,
  limit,
  loading = false,
  itemLabel = "results",
  theme,
  onPageChange,
  onScrollToTop,
  updatesAvailable,
}: DiscoveryPaginationProps) {
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInputVal, setPageInputVal] = useState("");

  const totalPages = Math.max(1, Math.ceil(totalHits / limit));

  const changePage = (p: number) => {
    onPageChange(p);
    onScrollToTop?.();
  };

  const handleJumpPage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const parsed = parseInt(pageInputVal, 10);
      if (!isNaN(parsed)) {
        const target = Math.max(1, Math.min(totalPages, parsed));
        changePage(target);
      }
      setIsEditingPage(false);
    } else if (e.key === "Escape") {
      setIsEditingPage(false);
    }
  };

  return (
    <div
      className="flex items-center justify-between text-xs px-1 select-none"
      style={{ color: theme.mutedForeground }}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        <span>
          {loading
            ? `Searching ${itemLabel}...`
            : totalHits === 0
              ? `No ${itemLabel} found`
              : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, totalHits)} of ${totalHits.toLocaleString()} ${itemLabel}`}
        </span>
        {updatesAvailable !== undefined && updatesAvailable > 0 && (
          <span className="font-semibold text-[11px]" style={{ color: theme.primary }}>
            ( {updatesAvailable} {updatesAvailable === 1 ? "update" : "updates"} available )
          </span>
        )}
      </span>

      <div className="flex items-center gap-1.5">
        {/* Previous Page */}
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => changePage(Math.max(1, page - 1))}
          title="Previous Page"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border disabled:opacity-30 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          style={{ background: theme.secondary, color: theme.foreground }}
        >
          <Icon name="arrowLeft" size={13} color="currentColor" />
        </button>

        {/* Current Page */}
        <button
          type="button"
          title={`Current page ${page}`}
          className="h-7 px-2.5 flex items-center justify-center rounded-md text-xs font-semibold"
          style={{
            background: theme.primary,
            color: theme.primaryForeground,
          }}
        >
          {page}
        </button>

        {/* Ellipsis / Number Jump */}
        {totalPages > 1 && page < totalPages && (
          <>
            {isEditingPage ? (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                placeholder={String(page)}
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={handleJumpPage}
                onBlur={() => {
                  if (pageInputVal.trim()) {
                    const parsed = parseInt(pageInputVal, 10);
                    if (!isNaN(parsed)) {
                      const target = Math.max(1, Math.min(totalPages, parsed));
                      changePage(target);
                    }
                  }
                  setIsEditingPage(false);
                }}
                className="w-12 h-7 px-1 text-center text-xs font-semibold rounded-md border border-border outline-none focus:border-primary"
                style={{
                  background: theme.secondary,
                  color: theme.foreground,
                }}
              />
            ) : (
              <button
                type="button"
                title="Click to enter page number"
                onClick={() => {
                  setPageInputVal(String(page));
                  setIsEditingPage(true);
                }}
                className="h-7 px-1.5 flex items-center justify-center rounded-md text-xs font-semibold border border-transparent hover:border-border cursor-pointer transition-colors"
                style={{ color: theme.mutedForeground }}
              >
                ...
              </button>
            )}

            {/* Last Page Button */}
            <button
              type="button"
              onClick={() => changePage(totalPages)}
              title={`Jump to last page (${totalPages})`}
              className="h-7 px-2.5 flex items-center justify-center rounded-md border border-border text-xs font-medium cursor-pointer transition-colors hover:bg-card"
              style={{
                background: theme.secondary,
                color: theme.foreground,
              }}
            >
              {totalPages}
            </button>
          </>
        )}

        {/* Next Page */}
        <button
          type="button"
          disabled={page >= totalPages || loading || totalHits === 0}
          onClick={() => changePage(Math.min(totalPages, page + 1))}
          title="Next Page"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border disabled:opacity-30 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          style={{ background: theme.secondary, color: theme.foreground }}
        >
          <Icon name="arrowRight" size={13} color="currentColor" />
        </button>
      </div>
    </div>
  );
}
