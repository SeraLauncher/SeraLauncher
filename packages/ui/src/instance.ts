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

export interface DiscoveryLicense {
  name: string;
  url?: string | null;
}

export interface DiscoveryLinks {
  website?: string | null;
  source?: string | null;
  issues?: string | null;
  wiki?: string | null;
  discord?: string | null;
  donate?: string | null;
}

export interface DiscoveryAuthor {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  url?: string | null;
}

export interface DiscoveryGalleryItem {
  title?: string | null;
  description?: string | null;
  url: string;
  thumbnailUrl?: string | null;
  featured?: boolean;
}

export interface DiscoveryVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  fileSize: number;
  downloadUrl: string;
  fileName: string;
  versionType: "release" | "beta" | "alpha" | string;
  downloads?: number;
}

export interface DiscoveryProjectDetails {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  descriptionType: "markdown" | "html";
  author: string;
  iconUrl?: string | null;
  downloads: number;
  follows?: number | null;
  source: "modrinth" | "curseforge";
  projectType: "modpack" | "mod" | "resourcepack" | "shader" | string;
  categories: string[];
  supportedLoaders: string[];
  supportedVersions: string[];
  environment?: "both" | "client" | "server" | null;
  links: DiscoveryLinks;
  creators: DiscoveryAuthor[];
  license?: DiscoveryLicense | null;
  publishedDate?: string | null;
  updatedDate?: string | null;
  gallery: DiscoveryGalleryItem[];
  webUrl: string;
  reportUrl: string;
}

export interface InstalledAddonItem {
  id: string;
  name: string;
  fileName: string;
  version?: string | null;
  description?: string | null;
  sizeBytes: number;
  enabled: boolean;
  modId?: string | null;
  dateModified?: string | null;
  source?: string | null;
  iconUrl?: string | null;
  projectId?: string | null;
}

export interface AddonUpdateInfo {
  fileName: string;
  currentVersion?: string | null;
  latestVersion: string;
  latestVersionId: string;
  latestDownloadUrl: string;
  latestFileName: string;
  projectId: string;
  provider: string;
}

export interface ScreenshotItem {
  fileName: string;
  sizeBytes: number;
  createdAt: number;
  dataUrl: string;
}

export interface CrashAnalysis {
  hasCrashed: boolean;
  title: string;
  causeCategory:
    | "out_of_memory"
    | "missing_dependency"
    | "incompatible_java"
    | "native_library"
    | "mod_conflict"
    | "corrupt_jar"
    | "general"
    | "none"
    | string;
  summary: string;
  suspectedMods: string[];
  suggestedFix: string;
  technicalDetails?: string | null;
  crashReportFile?: string | null;
  timestamp?: string | null;
}
