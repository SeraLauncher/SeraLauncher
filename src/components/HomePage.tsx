import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "./Icon";
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

const DEFAULT_INSTANCES = ["1.21.4 (Latest Release)", "1.21.4 (Fabric Loader)", "1.20.1 (Forge)"];

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

export function HomePage({ theme }: { theme: Theme }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0);
  const [showInstanceMenu, setShowInstanceMenu] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadNews() {
      try {
        setLoading(true);
        // routing through tauri bypasses webview origin restrictions on mojang services
        const res = await invoke<NewsResponse>("fetch_minecraft_news", { pageSize: 4 });
        if (!cancelled && res.entries && res.entries.length > 0) {
          setArticles(res.entries);
        }
      } catch (err) {
        // fallback prevents an empty broken home page if offline or services fail
        console.warn("sera: failed to load minecraft news, using fallbacks:", err);
        if (!cancelled) {
          setArticles(FALLBACK_ARTICLES);
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

  const handlePlay = () => {
    setLaunching(true);
    setTimeout(() => setLaunching(false), 2000);
  };

  const displayedArticles =
    articles.length > 0 ? articles.slice(0, 4) : FALLBACK_ARTICLES.slice(0, 4);

  return (
    <div className="home-container">
      {/* hero background banner with overlapping action dock */}
      <div className="home-hero-container">
        <div
          className="home-hero"
          style={{
            borderColor: theme.raised,
            background: theme.card,
          }}
        >
          <img src={homeBg} alt="Minecraft Background" className="home-hero-bg" />
          <div className="home-hero-overlay" />
        </div>

        {/* docked play action block overlapping the bottom edge */}
        <div className="home-dock">
          <motion.button
            type="button"
            className="home-play-btn"
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
            <span className="home-play-text">{launching ? "Launching..." : "Play"}</span>
          </motion.button>

          <div className="home-instance-wrapper">
            <button
              type="button"
              className="home-instance-pill"
              style={{
                background: theme.card,
                borderColor: theme.raised,
                color: theme.text,
              }}
              onClick={() => setShowInstanceMenu((prev) => !prev)}
            >
              <Icon name="instance" size={16} color={theme.accent} />
              <span className="home-instance-label">
                {DEFAULT_INSTANCES[selectedInstanceIndex]}
              </span>
              <Icon name="chevronDown" size={14} color={theme.muted} />
            </button>

            {showInstanceMenu && (
              <div
                className="home-instance-dropdown"
                style={{
                  background: theme.card,
                  borderColor: theme.raised,
                  boxShadow: `0 8px 24px rgba(0, 0, 0, 0.45)`,
                }}
              >
                {DEFAULT_INSTANCES.map((inst, index) => (
                  <button
                    key={inst}
                    type="button"
                    className="home-instance-option"
                    style={{
                      color: index === selectedInstanceIndex ? theme.accent : theme.text,
                      background: index === selectedInstanceIndex ? theme.panel : "transparent",
                    }}
                    onClick={() => {
                      setSelectedInstanceIndex(index);
                      setShowInstanceMenu(false);
                    }}
                  >
                    <span>{inst}</span>
                    {index === selectedInstanceIndex && (
                      <span className="home-instance-check" style={{ color: theme.accent }}>
                        •
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* article section divider */}
      <div className="home-divider-row">
        <div className="home-divider-line" style={{ background: theme.raised }} />
        <span className="home-divider-title" style={{ color: theme.text }}>
          Latest News
        </span>
        <div className="home-divider-line" style={{ background: theme.raised }} />
      </div>

      {/* article cards row: 3 or 4 cards depending on screen width */}
      <div className="home-articles-grid">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="home-article-card home-article-skeleton"
                style={{
                  background: theme.card,
                  borderColor: theme.raised,
                }}
              />
            ))
          : displayedArticles.map((article) => (
              <motion.article
                key={article.url + article.title}
                className="home-article-card"
                style={{
                  background: theme.card,
                  borderColor: theme.raised,
                }}
                whileHover={{ borderColor: theme.accent }}
                transition={snappy}
                onClick={() => openArticle(article.url)}
              >
                <div className="home-article-thumb-wrapper">
                  <img
                    src={article.image}
                    alt={article.imageAltText || article.title}
                    className="home-article-thumb"
                    loading="lazy"
                  />
                  {article.category && (
                    <span
                      className="home-article-badge"
                      style={{
                        background: theme.panel,
                        color: theme.accent,
                        borderColor: theme.raised,
                      }}
                    >
                      {article.category}
                    </span>
                  )}
                </div>

                <div className="home-article-body">
                  <span className="home-article-date" style={{ color: theme.muted }}>
                    {formatDate(article.time)}
                  </span>
                  <h3 className="home-article-title" style={{ color: theme.text }}>
                    {article.title}
                  </h3>
                  <p className="home-article-desc" style={{ color: theme.muted }}>
                    {article.description}
                  </p>
                </div>
              </motion.article>
            ))}
      </div>
    </div>
  );
}
