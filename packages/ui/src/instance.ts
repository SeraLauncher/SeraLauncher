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
