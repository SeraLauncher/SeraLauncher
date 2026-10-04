import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "./Icon";
import { PlayerModelView } from "@sera/player-model";
import type { Theme } from "../theme";
import { snappy } from "../motion";
import homeBg from "../assets/images/home-bg.png";

export type NewsArticle = {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAltText?: string;
  author?: string;
  time?: number;
  tags?: string[];
  category?: string;
};

type NewsResponse = {
  entries: NewsArticle[];
  total?: number;
};

const FALLBACK_ARTICLES: NewsArticle[] = [
  {
    title: "Minecraft 26.4 Snapshot 2",
    description: "Minecraft 26.4 Snapshot 2",
    url: "https://www.minecraft.net/en-us/article/minecraft-26-4-snapshot-2",
    image:
      "https://www.minecraft.net/content/dam/minecraftnet/article-asset/2026/minecraft-26-4-snapshot-2/new-article-hero-image.jpg",
    category: "News",
    time: 1790690400,
  },
  {
    title: "Minecraft 26.4 Snapshot 1",
    description: "Minecraft 26.4 Snapshot 1",
    url: "https://www.minecraft.net/en-us/article/minecraft-26-4-snapshot-1",
    image:
      "https://www.minecraft.net/content/dam/minecraftnet/article-asset/2026/minecraft-26-4-snapshot-1/new-article-hero-image.jpg",
    category: "News",
    time: 1790085600,
  },
  {
    title: "Minecraft 26.3 Release Candidate 2",
    description: "Minecraft 26.3 Release Candidate 2",
    url: "https://www.minecraft.net/en-us/article/minecraft-26-3-release-candidate-2",
    image:
      "https://www.minecraft.net/content/dam/minecraftnet/article-asset/2026/minecraft-26-3-release-candidate-2/new-article-hero-image.jpg",
    category: "News",
    time: 1789135200,
  },
  {
    title: "Minecraft 26.3 Release Candidate 1",
    description: "Minecraft 26.3 Release Candidate 1",
    url: "https://www.minecraft.net/en-us/article/minecraft-26-3-release-candidate-1",
    image:
      "https://www.minecraft.net/content/dam/minecraftnet/article-asset/2026/minecraft-26-3-release-candidate-1/new-article-hero-image.jpg",
    category: "News",
    time: 1788530400,
  },
];

function formatDate(timestamp?: number): string {
  if (!timestamp) return "Recent";
  // timestamps from mojang search api arrive in seconds
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function openArticle(url: string) {
  openUrl(url).catch(() => {
    // web fallback when plugin-opener is unavailable or running outside tauri
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

interface NewsCache {
  articles: NewsArticle[];
  timestamp: number;
}

let memoryNewsCache: NewsCache | null = null;
const CACHE_STORAGE_KEY = "sera:minecraft_news_cache_v1";
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

function getCachedNews(): NewsCache | null {
  if (memoryNewsCache && memoryNewsCache.articles.length > 0) {
    return memoryNewsCache;
  }
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.articles) && parsed.articles.length > 0) {
        memoryNewsCache = parsed;
        return memoryNewsCache;
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function setCachedNews(articles: NewsArticle[]) {
  const cache: NewsCache = {
    articles,
    timestamp: Date.now(),
  };
  memoryNewsCache = cache;
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch {
    // ignore storage errors
  }
}

function areArticlesEqual(a: NewsArticle[], b: NewsArticle[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) => item.url === b[i].url && item.title === b[i].title && item.image === b[i].image,
  );
}

export function HomePage({
  theme,
  instances = [],
  skinUrl,
  username,
  onNavigateToInstances,
  onLaunch,
}: {
  theme: Theme;
  instances?: string[];
  skinUrl?: string;
  username?: string;
  onNavigateToInstances?: () => void;
  onLaunch?: (instanceName: string) => void;
}) {
  const initialCache = getCachedNews();
  const [articles, setArticles] = useState<NewsArticle[]>(() => initialCache?.articles ?? []);
  const [loading, setLoading] = useState(!initialCache || initialCache.articles.length === 0);
  const [selectedInstanceOverride, setSelectedInstance] = useState<string | null>(null);
  const [showInstanceMenu, setShowInstanceMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [launching, setLaunching] = useState(false);

  // Derived active selected instance
  const selectedInstance =
    selectedInstanceOverride && instances.includes(selectedInstanceOverride)
      ? selectedInstanceOverride
      : (instances[0] ?? null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // search input only renders when there are 5 or more instances
  const hasSearch = instances.length >= 5;

  const filteredInstances = useMemo(() => {
    if (!hasSearch || !query.trim()) return instances;
    const needle = query.trim().toLowerCase();
    return instances.filter((inst) => inst.toLowerCase().includes(needle));
  }, [hasSearch, instances, query]);

  // focus search on open so the user can immediately type
  useEffect(() => {
    if (showInstanceMenu && hasSearch) {
      searchInputRef.current?.focus();
    }
  }, [showInstanceMenu, hasSearch]);

  // close on outside click to behave like a standard menu
  useEffect(() => {
    if (!showInstanceMenu) return;
    const away = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setShowInstanceMenu(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [showInstanceMenu]);

  // escape closes the dropdown
  useEffect(() => {
    if (!showInstanceMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowInstanceMenu(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showInstanceMenu]);

  useEffect(() => {
    let cancelled = false;

    const cache = getCachedNews();
    const isFresh = cache && Date.now() - cache.timestamp < NEWS_CACHE_TTL_MS;

    // If cache is fresh and we have articles, do not refetch at all on tab switch
    if (isFresh && cache.articles.length > 0) {
      return;
    }

    async function loadNews() {
      try {
        // Only show skeleton placeholder if we have no articles to display
        if (!cache || cache.articles.length === 0) {
          setLoading(true);
        }
        // routing through tauri bypasses webview origin restrictions on mojang services
        const res = await invoke<NewsResponse>("fetch_minecraft_news", { pageSize: 4 });
        if (!cancelled && res.entries && res.entries.length > 0) {
          setCachedNews(res.entries);
          setArticles((prev) => (areArticlesEqual(prev, res.entries) ? prev : res.entries));
        }
      } catch (err) {
        // fallback prevents an empty broken home page if offline or services fail
        console.warn("sera: failed to load minecraft news, using fallbacks:", err);
        if (!cancelled) {
          setArticles((prev) => (prev.length > 0 ? prev : FALLBACK_ARTICLES));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadNews();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlay = async () => {
    if (!selectedInstance) {
      if (onNavigateToInstances) {
        onNavigateToInstances();
      }
      return;
    }
    setLaunching(true);
    try {
      if (onLaunch) {
        await onLaunch(selectedInstance);
      }
    } finally {
      setTimeout(() => setLaunching(false), 1500);
    }
  };

  const displayedArticles =
    articles.length > 0 ? articles.slice(0, 4) : FALLBACK_ARTICLES.slice(0, 4);

  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-8 min-h-full">
      {/* hero background banner with overlapping action dock */}
      <div className="relative w-full mb-12 shrink-0">
        <div
          className="relative w-full h-[360px] rounded-[14px] overflow-hidden border border-secondary shrink-0"
          style={{
            borderColor: theme.border,
            background: theme.card,
          }}
        >
          <img
            src={homeBg}
            alt="Minecraft Background"
            className="w-full h-full object-cover object-center block"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/8 to-black/55 pointer-events-none" />
        </div>

        {/* docked play action block overlapping the bottom edge */}
        <div className="absolute top-[calc(100%-24px)] left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
          <div className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 w-[200px] h-[280px] flex items-center justify-center z-[3] pointer-events-none select-none">
            <PlayerModelView
              skinUrl={skinUrl}
              username={username}
              width={200}
              height={280}
              animated={true}
              interactive={false}
            />
          </div>

          <motion.button
            type="button"
            className="relative z-[2] inline-flex items-center justify-center gap-2.5 w-[240px] h-12 px-6 border-0 rounded-xl text-[1.15rem] font-bold tracking-[0.02em] cursor-pointer shadow-none transition-transform duration-120 active:scale-95"
            style={{
              background: theme.success,
              color: "#ffffff",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={snappy}
            onClick={handlePlay}
          >
            <Icon name="play" size={20} color="#ffffff" />
            <span className="leading-none font-bold">{launching ? "Launching..." : "Play"}</span>
          </motion.button>

          <div className="relative z-[1] flex justify-center w-full -mt-1" ref={wrapperRef}>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 w-[210px] pt-2.5 px-3.5 pb-1.5 rounded-b-[10px] border-0 bg-secondary text-[0.82rem] font-semibold cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.2)] transition-colors hover:border-accent"
              style={{
                background: theme.secondary,
                border: 0,
                color: theme.foreground,
                cursor: instances.length === 0 ? "pointer" : undefined,
              }}
              onClick={() => {
                if (instances.length === 0) {
                  onNavigateToInstances?.();
                  return;
                }
                setShowInstanceMenu((prev) => {
                  if (prev) setQuery("");
                  return !prev;
                });
              }}
              aria-haspopup="listbox"
              aria-expanded={showInstanceMenu}
            >
              <Icon name="instance" size={16} color={theme.primary} />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis text-center">
                {instances.length === 0
                  ? "No instance installed"
                  : selectedInstance || instances[0]}
              </span>
              {instances.length > 0 && (
                <motion.span
                  className="inline-flex items-center justify-center shrink-0"
                  animate={{ rotate: showInstanceMenu ? 180 : 0 }}
                  transition={snappy}
                >
                  <Icon name="chevronDown" size={14} color={theme.mutedForeground} />
                </motion.span>
              )}
            </button>

            <AnimatePresence>
              {showInstanceMenu && (
                <motion.div
                  key="instance-dropdown"
                  className="absolute top-[calc(100%+6px)] left-1/2 min-w-[240px] max-w-[320px] w-max rounded-[10px] border-0 bg-secondary p-1 flex flex-col gap-0.5 z-50 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
                  initial={{ opacity: 0, scale: 0.96, y: -4, x: "-50%" }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, scale: 0.96, y: -4, x: "-50%" }}
                  transition={snappy}
                  style={{
                    background: theme.secondary,
                    border: `1px solid ${theme.border}`,
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
                    transformOrigin: "top center",
                  }}
                >
                  {hasSearch && (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded-md border-0 bg-card focus-within:border-accent"
                      style={{
                        background: theme.card,
                        border: 0,
                      }}
                    >
                      <Icon name="search" size={14} color={theme.mutedForeground} />
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="flex-1 min-w-0 p-0 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                        placeholder="Search version..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ color: theme.foreground }}
                      />
                      {query && (
                        <button
                          type="button"
                          className="flex items-center justify-center size-4 p-0 border-0 bg-transparent text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => setQuery("")}
                          aria-label="Clear search"
                        >
                          <Icon name="reset" size={12} color={theme.mutedForeground} />
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    className="max-h-[160px] overflow-y-auto flex flex-col gap-0.5 p-0 m-0 list-none"
                    role="listbox"
                  >
                    {filteredInstances.map((inst) => {
                      const isSelected = inst === selectedInstance;
                      return (
                        <button
                          key={inst}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-md border-0 bg-transparent text-sm font-medium text-left cursor-pointer transition-colors hover:bg-card hover:text-foreground"
                          style={{
                            color: isSelected ? theme.primary : theme.foreground,
                            background: isSelected ? theme.card : "transparent",
                          }}
                          onClick={() => {
                            setSelectedInstance(inst);
                            setShowInstanceMenu(false);
                            setQuery("");
                          }}
                        >
                          <span>{inst}</span>
                        </button>
                      );
                    })}
                    {filteredInstances.length === 0 && (
                      <div
                        className="px-3 py-2 text-center text-xs text-muted-foreground"
                        style={{ color: theme.mutedForeground }}
                      >
                        No match
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* article section divider */}
      <div className="flex items-center gap-3 w-full my-2">
        <div className="flex-1 h-px bg-border/50" style={{ background: theme.border }} />
        <span
          className="text-xs font-bold tracking-[0.06em] uppercase text-muted-foreground shrink-0"
          style={{ color: theme.foreground }}
        >
          Latest News
        </span>
        <div className="flex-1 h-px bg-border/50" style={{ background: theme.border }} />
      </div>

      {/* article cards row: 3 or 4 cards depending on screen width */}
      <div className="grid grid-cols-3 min-[1040px]:grid-cols-4 gap-3">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col rounded-[10px] border border-secondary overflow-hidden min-h-[190px] opacity-60 animate-pulse-shimmer [&:nth-child(n+4)]:hidden min-[1040px]:[&:nth-child(n+4)]:flex"
                style={{
                  background: theme.card,
                  borderColor: theme.border,
                }}
              />
            ))
          : displayedArticles.map((article) => (
              <motion.article
                key={article.url + article.title}
                className="flex flex-col rounded-[10px] border border-secondary overflow-hidden cursor-pointer transition-colors duration-150 hover:border-accent [&:nth-child(n+4)]:hidden min-[1040px]:[&:nth-child(n+4)]:flex"
                style={{
                  background: theme.card,
                  borderColor: theme.border,
                }}
                whileHover={{ borderColor: theme.primary }}
                transition={snappy}
                onClick={() => openArticle(article.url)}
              >
                <div className="relative w-full aspect-[16/9] overflow-hidden">
                  <img
                    src={article.image}
                    alt={article.imageAltText || article.title}
                    className="w-full h-full object-cover object-center block transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
                  {article.category && (
                    <span
                      className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-xs uppercase tracking-wider"
                      style={{
                        background: theme.secondary,
                        color: theme.primary,
                        borderColor: theme.border,
                      }}
                    >
                      {article.category}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col p-3 gap-1 bg-card">
                  <span
                    className="text-[11px] text-muted-foreground font-mono"
                    style={{ color: theme.mutedForeground }}
                  >
                    {formatDate(article.time)}
                  </span>
                  <h3
                    className="text-xs font-semibold line-clamp-1 leading-snug"
                    style={{ color: theme.foreground }}
                  >
                    {article.title}
                  </h3>
                  <p
                    className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed"
                    style={{ color: theme.mutedForeground }}
                  >
                    {article.description}
                  </p>
                </div>
              </motion.article>
            ))}
      </div>
    </div>
  );
}
