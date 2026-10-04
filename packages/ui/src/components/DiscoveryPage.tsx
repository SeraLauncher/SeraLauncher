import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";
import { Dropdown } from "./Dropdown";
import type { Theme } from "../theme";
import type {
  DiscoveryProject,
  DiscoverySearchResponse,
  Instance,
  MinecraftVersion,
} from "../instance";

export type DiscoveryCategory = "modpack" | "mods" | "resourcepack" | "shader";
export type DiscoveryProvider = "modrinth" | "curseforge";

interface DiscoveryPageProps {
  theme: Theme;
  instances: Instance[];
  versions: MinecraftVersion[];
}

export function DiscoveryPage({ theme, instances, versions }: DiscoveryPageProps) {
  const [provider, setProvider] = useState<DiscoveryProvider>("modrinth");
  const [category, setCategory] = useState<DiscoveryCategory>("modpack");
  const [search, setSearch] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<string>("all");
  const [selectedLoader, setSelectedLoader] = useState<string>("all");
  const [sort, setSort] = useState<string>("downloads");

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<DiscoveryProject[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 30;
  const totalPages = Math.max(1, Math.ceil(totalHits / limit));
  const gridRef = useRef<HTMLDivElement>(null);

  // Reset to page 1 whenever filters change
  const filterKey = `${provider}-${category}-${search}-${selectedVersion}-${selectedLoader}-${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // Quick install modal state
  const [installingProject, setInstallingProject] = useState<DiscoveryProject | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instances[0]?.id || "");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const timer = setTimeout(() => {
      setLoading(true);
      invoke<DiscoverySearchResponse>("search_discovery", {
        provider,
        projectType: category,
        query: search.trim() || null,
        mcVersion: selectedVersion === "all" ? null : selectedVersion,
        loader: selectedLoader === "all" ? null : selectedLoader,
        sort,
        offset: (page - 1) * limit,
        limit,
      })
        .then((res) => {
          if (!active) return;
          setProjects(res.projects || []);
          setTotalHits(res.totalHits || 0);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setProjects([]);
          setTotalHits(0);
          setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, category, search, selectedVersion, selectedLoader, sort, page]);

  const versionOptions = useMemo(() => {
    const list = versions
      .filter((v) => v.type === "release")
      .slice(0, 30)
      .map((v) => v.id);
    return ["all", ...list];
  }, [versions]);

  const loaderOptions = ["all", "fabric", "forge", "neoforge", "quilt"] as const;

  const sortOptions = ["downloads", "relevance", "updated", "newest"] as const;

  const handleInstallFile = async () => {
    if (!installingProject || !selectedInstanceId) return;
    setIsInstalling(true);
    setInstallSuccess(null);

    try {
      const fileName = `${installingProject.slug || "addon"}.jar`;
      const downloadUrl =
        installingProject.downloadUrl ||
        `https://api.modrinth.com/v2/project/${installingProject.id}/version`;

      await invoke("install_discovery_project", {
        instanceId: selectedInstanceId,
        projectType: installingProject.projectType,
        downloadUrl,
        fileName,
      });

      setInstallSuccess(
        `Installed into ${instances.find((i) => i.id === selectedInstanceId)?.name}!`,
      );
      setTimeout(() => {
        setInstallingProject(null);
        setInstallSuccess(null);
      }, 1800);
    } catch {
      // fallback
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4">
      {/* Top Bar: Category tabs on left, Provider toggle on right */}
      <div className="flex items-center justify-between gap-3">
        {/* Categories */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg border border-border"
          style={{ background: theme.secondary }}
        >
          {(
            [
              { id: "modpack", label: "Modpacks", icon: "cubes" },
              { id: "mods", label: "Mods", icon: "puzzle" },
              { id: "resourcepack", label: "Resource Packs", icon: "palette" },
              { id: "shader", label: "Shaders", icon: "wand" },
            ] as const
          ).map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all"
                style={{
                  background: active ? theme.card : "transparent",
                  color: active ? theme.foreground : theme.mutedForeground,
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  fontSize: "0.82rem",
                  lineHeight: 1.2,
                }}
              >
                <Icon
                  name={tab.icon as any}
                  size={15}
                  color={active ? theme.primary : theme.mutedForeground}
                />
                <span style={{ fontSize: "0.82rem" }}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Provider Switcher */}
        <div
          className="flex items-center p-1 rounded-lg border border-border gap-1"
          style={{ background: theme.sidebarAccent }}
        >
          <button
            type="button"
            onClick={() => setProvider("modrinth")}
            className="px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: provider === "modrinth" ? theme.primary : "transparent",
              color: provider === "modrinth" ? theme.primaryForeground : theme.mutedForeground,
              fontWeight: provider === "modrinth" ? 600 : 500,
              fontSize: "0.82rem",
              lineHeight: 1.2,
            }}
          >
            Modrinth
          </button>
          <button
            type="button"
            onClick={() => setProvider("curseforge")}
            className="px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: provider === "curseforge" ? theme.primary : "transparent",
              color: provider === "curseforge" ? theme.primaryForeground : theme.mutedForeground,
              fontWeight: provider === "curseforge" ? 600 : 500,
              fontSize: "0.82rem",
              lineHeight: 1.2,
            }}
          >
            CurseForge
          </button>
        </div>
      </div>

      {/* Filter / Search Bar (outer box removed) */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Search Input matched to Dropdown height */}
        <div
          className="flex-1 min-w-[220px] h-[34px] flex items-center gap-2 px-3 rounded-lg border border-border"
          style={{ background: theme.secondary }}
        >
          <Icon name="search" size={14} color={theme.mutedForeground} />
          <input
            type="text"
            placeholder={`Search ${category}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-transparent outline-none border-none h-full"
            style={{ color: theme.foreground }}
          />
        </div>

        {/* Themed Version Dropdown */}
        <div className="w-36">
          <Dropdown
            value={selectedVersion}
            options={versionOptions}
            render={(opt) => (opt === "all" ? "All Versions" : opt)}
            onChange={(opt) => setSelectedVersion(opt)}
            theme={theme}
          />
        </div>

        {/* Themed Loader Dropdown */}
        {(category === "mods" || category === "modpack") && (
          <div className="w-36">
            <Dropdown
              value={selectedLoader}
              options={loaderOptions}
              render={(opt) =>
                opt === "all" ? "All Loaders" : opt.charAt(0).toUpperCase() + opt.slice(1)
              }
              onChange={(opt) => setSelectedLoader(opt)}
              theme={theme}
            />
          </div>
        )}

        {/* Themed Sort Dropdown */}
        <div className="w-40">
          <Dropdown
            value={sort}
            options={sortOptions}
            render={(opt) => {
              if (opt === "downloads") return "Most Downloads";
              if (opt === "relevance") return "Relevance";
              if (opt === "updated") return "Recently Updated";
              return "Newest";
            }}
            onChange={(opt) => setSort(opt)}
            theme={theme}
          />
        </div>
      </div>

      {/* Results Header & Pagination */}
      <div
        className="flex items-center justify-between text-xs px-1"
        style={{ color: theme.mutedForeground }}
      >
        <span>
          {loading
            ? "Searching..."
            : totalHits === 0
              ? "No results"
              : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, totalHits)} of ${totalHits.toLocaleString()} results`}
        </span>

        {/* Pagination */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              gridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-2.5 py-1 rounded border border-border text-xs font-medium disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed"
            style={{ background: theme.secondary, color: theme.foreground }}
          >
            Previous
          </button>
          <span style={{ color: theme.mutedForeground }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading || projects.length === 0}
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              gridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-2.5 py-1 rounded border border-border text-xs font-medium disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed"
            style={{ background: theme.secondary, color: theme.foreground }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-border animate-pulse"
                style={{ background: theme.card }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-64 rounded-xl border border-border"
            style={{ background: theme.card }}
          >
            <Icon name="search" size={28} color={theme.mutedForeground} />
            <span className="text-sm font-medium mt-3" style={{ color: theme.foreground }}>
              No {category} found
            </span>
            <span className="text-xs mt-1" style={{ color: theme.mutedForeground }}>
              Try adjusting your search query or filters
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-6">
            {projects.map((item) => {
              const dlCount =
                item.downloads >= 1_000_000
                  ? `${(item.downloads / 1_000_000).toFixed(1)}M`
                  : item.downloads >= 1_000
                    ? `${Math.round(item.downloads / 1_000)}k`
                    : `${item.downloads}`;

              return (
                <div
                  key={`${item.source}-${item.id}`}
                  className="flex flex-col justify-between p-3.5 rounded-xl border border-border transition-all hover:shadow-lg"
                  style={{ background: theme.card }}
                >
                  <div className="flex items-start gap-3">
                    {item.iconUrl ? (
                      <img
                        src={item.iconUrl}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 border border-border"
                        style={{ background: theme.secondary }}
                      >
                        <Icon name="cubes" size={20} color={theme.mutedForeground} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-sm font-semibold truncate"
                        style={{ color: theme.foreground }}
                        title={item.title}
                      >
                        {item.title}
                      </h3>
                      <p
                        className="text-[11px] truncate mt-0.5"
                        style={{ color: theme.mutedForeground }}
                      >
                        by {item.author}
                      </p>
                      <p
                        className="text-xs line-clamp-2 mt-1.5 leading-snug"
                        style={{ color: theme.mutedForeground }}
                      >
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Card Bottom */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
                    <span
                      className="flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: theme.mutedForeground }}
                    >
                      <Icon name="download" size={11} color="currentColor" />
                      {dlCount}
                    </span>

                    <button
                      type="button"
                      onClick={() => setInstallingProject(item)}
                      className="px-3 py-1 text-xs font-semibold rounded-md transition-opacity hover:opacity-90"
                      style={{
                        background: theme.primary,
                        color: theme.primaryForeground,
                      }}
                    >
                      Install
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Install Dialog */}
      {installingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-border p-5 shadow-2xl flex flex-col gap-4"
            style={{ background: theme.card }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: theme.foreground }}>
                Install {installingProject.title}
              </h2>
              <button
                type="button"
                onClick={() => setInstallingProject(null)}
                className="text-xs p-1 rounded"
                style={{ color: theme.mutedForeground }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: theme.mutedForeground }}>
              Choose which instance to install this {installingProject.projectType} into:
            </p>

            {instances.length === 0 ? (
              <div
                className="text-xs p-3 rounded-lg border border-border text-center"
                style={{ background: theme.secondary, color: theme.mutedForeground }}
              >
                No instances created yet. Please create an instance first!
              </div>
            ) : (
              <div className="w-full">
                <Dropdown
                  value={selectedInstanceId}
                  options={instances.map((i) => i.id)}
                  render={(id) => {
                    const inst = instances.find((i) => i.id === id);
                    return inst
                      ? `${inst.name} (${inst.loader ? inst.loader : "Vanilla"} ${inst.mcVersion})`
                      : id;
                  }}
                  onChange={(id) => setSelectedInstanceId(id)}
                  theme={theme}
                />
              </div>
            )}

            {installSuccess && (
              <div className="text-xs text-center font-medium py-1 text-emerald-500">
                ✓ {installSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setInstallingProject(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border"
                style={{ color: theme.foreground }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={instances.length === 0 || isInstalling}
                onClick={handleInstallFile}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 transition-opacity"
                style={{
                  background: theme.primary,
                  color: theme.primaryForeground,
                }}
              >
                {isInstalling ? "Installing..." : "Install Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
