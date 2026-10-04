export type Instance = {
  id: string;
  name: string;
  mcVersion: string;
  versionType: string;
  javaVersionRequired: number;
  customJavaPath?: string | null;
  minMemory?: number | null;
  maxMemory?: number | null;
  jvmArgs?: string | null;
  icon?: string | null;
  createdAt: string;
  lastPlayed?: string | null;
  playTimeSeconds: number;
  loader?: "vanilla" | "fabric" | "forge" | "neoforge" | "quilt" | string | null;
  loaderVersion?: string | null;
};

export type ModLoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export type LoaderVersionInfo = {
  version: string;
  stable: boolean;
};

export type DiscoveryProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string | null;
  downloads: number;
  follows?: number | null;
  source: "modrinth" | "curseforge" | string;
  projectType: "modpack" | "mod" | "resourcepack" | "shader" | string;
  categories: string[];
  supportedLoaders: string[];
  supportedVersions: string[];
  dateModified?: string | null;
  downloadUrl?: string | null;
  environment?: "both" | "client" | "server" | string | null;
};

export type DiscoverySearchResponse = {
  source: string;
  projects: DiscoveryProject[];
  totalHits: number;
  offset: number;
  limit: number;
};

export type MinecraftVersion = {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
  requiredJavaVersion: number;
};

export type MinecraftVersionsResponse = {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftVersion[];
};

export type InstanceManagementTab =
  | "overview"
  | "mods"
  | "resourcepacks"
  | "shaders"
  | "screenshots"
  | "settings";

export function formatPlayTime(seconds?: number | null): string {
  if (!seconds || seconds <= 0) {
    return "Never played";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

export type RunningInstanceInfo = {
  id: string;
  name: string;
  mcVersion: string;
  startedAt: number;
};
