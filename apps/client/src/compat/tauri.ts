import * as MyGo from "../mygo";

type InvokeHandler = (args: any) => Promise<any>;

// Map of legacy Tauri command names to typed MyGo service calls
const COMMAND_MAP: Record<string, InvokeHandler> = {
  // Settings & System
  load_settings: () => MyGo.SettingsService.loadSettings(),
  save_settings: (args) => MyGo.SettingsService.saveSettings(args?.settings ?? args),
  list_fonts: () => MyGo.SystemService.listFonts(),
  get_system_memory: () => MyGo.SystemService.getSystemMemory(),
  set_discord_navigation: (args) =>
    MyGo.DiscordService.setDiscordNavigation(args?.status ?? null),

  // Java Runtimes
  list_java_runtimes: () => MyGo.JavaService.listRuntimes(),
  validate_java_path: (args) => MyGo.JavaService.validateJavaPath(args.path),
  get_required_java_version: (args) =>
    MyGo.JavaService.getRequiredVersion(args.mcVersion),
  get_managed_java_runtimes: () => MyGo.JavaService.getManagedRuntimes(),
  uninstall_managed_java_runtime: (args) =>
    MyGo.JavaService.uninstallManagedRuntime(args.majorVersion),
  install_java_runtime: (args) =>
    MyGo.JavaService.installAdoptium(args.majorVersion),

  // Accounts & Skins
  get_active_account: () => MyGo.AuthService.getActiveAccount(),
  get_all_accounts: () => MyGo.AuthService.getAllAccounts(),
  set_active_account: (args) => MyGo.AuthService.setActiveAccount(args.id),
  remove_account: (args) => MyGo.AuthService.removeAccount(args.id),
  add_offline_account: (args) => MyGo.AuthService.addOfflineAccount(args.username),
  start_microsoft_login: () => MyGo.AuthService.startMicrosoftLogin(),
  poll_microsoft_login: (args) =>
    MyGo.AuthService.pollMicrosoftLogin(args.deviceCode),
  login_elyby: (args) =>
    MyGo.AuthService.loginElyBy(args.username, args.password),
  login_littleskin: (args) =>
    MyGo.AuthService.loginLittleSkin(args.username, args.password),
  refresh_account_skins: () => MyGo.AuthService.refreshAccountSkins(),
  fetch_skin_as_data_url: (args) => MyGo.AuthService.fetchSkinAsDataURL(args.url),

  // Instances
  list_instances: () => MyGo.InstanceService.listInstances(),
  create_instance: (args) => MyGo.InstanceService.createInstance(args),
  update_instance: (args) => MyGo.InstanceService.updateInstance(args.instance),
  delete_instance: (args) => MyGo.InstanceService.deleteInstance(args.id),
  get_instance_screenshots: (args) => MyGo.InstanceService.getScreenshots(args.id),
  delete_instance_screenshot: (args) =>
    MyGo.InstanceService.deleteScreenshot(args.id, args.fileName),
  open_instance_folder: (args) =>
    MyGo.InstanceService.openFolder(args.id, args.subfolder ?? null),
  get_instance_path: (args) => MyGo.InstanceService.getInstancePath(args.id),

  // Minecraft Launching & Logs
  launch_instance: (args) => MyGo.MinecraftService.launchInstance(args.id),
  launch_instance_quick_play: (args) =>
    MyGo.MinecraftService.launchInstanceQuickPlay(
      args.id,
      args.quickPlayType,
      args.target,
    ),
  build_horizon_native_mods: (args) =>
    MyGo.MinecraftService.buildHorizonNativeMods(args.id),
  get_horizon_native_build_status: (args) =>
    MyGo.MinecraftService.getHorizonNativeBuildStatus(args.id),
  get_horizon_engine_version: (args) =>
    MyGo.MinecraftService.getHorizonEngineVersion(args.id ?? args.instanceId),
  update_horizon_engine: (args) =>
    MyGo.MinecraftService.updateHorizonEngine(args.id ?? args.instanceId),
  get_running_instances: () => MyGo.MinecraftService.getRunningInstances(),
  kill_instance: (args) => MyGo.MinecraftService.killInstance(args.id),
  get_instance_logs: (args) => MyGo.MinecraftService.getInstanceLogs(args.id),
  get_minecraft_versions: () => MyGo.MinecraftService.getMinecraftVersions(),
  fetch_minecraft_news: (args) =>
    MyGo.MinecraftService.fetchMinecraftNews(args?.pageSize ?? 4),

  // Mod Loaders
  get_mod_loader_versions: (args) =>
    MyGo.LoaderService.getModLoaderVersions(args.mcVersion, args.loader),
  install_mod_loader: (args) =>
    MyGo.LoaderService.installModLoader(args.instanceId, args.loader, args.loaderVersion),

  // Addon Discovery & Mods
  search_discovery: (args) =>
    MyGo.DiscoveryService.searchDiscovery({
      provider: args.provider,
      projectType: args.projectType ?? args.project_type,
      query: args.query ?? null,
      mcVersion: args.mcVersion ?? args.mc_version ?? null,
      loader: args.loader ?? null,
      offset: args.offset ?? 0,
      limit: args.limit ?? 20,
    }),
  get_discovery_project_details: (args) =>
    MyGo.DiscoveryService.getDiscoveryProjectDetails(
      args.provider,
      args.projectId ?? args.project_id ?? args.id,
    ),
  get_discovery_project_versions: (args) =>
    MyGo.DiscoveryService.getDiscoveryProjectVersions(
      args.provider,
      args.projectId ?? args.project_id ?? args.id,
      args.mcVersion ?? args.mc_version ?? null,
      args.loader ?? null,
    ),
  get_installed_addons_list: (args) =>
    MyGo.DiscoveryService.getInstalledAddonsList(
      args.instanceId ?? args.instance_id ?? args.id,
      args.projectType ?? args.project_type,
    ),
  get_installed_addon_ids: (args) =>
    MyGo.DiscoveryService.getInstalledAddonIDs(
      args.instanceId ?? args.instance_id ?? args.id,
      args.projectType ?? args.project_type,
    ),
  toggle_addon_enabled: (args) =>
    MyGo.DiscoveryService.toggleAddonEnabled(
      args.instanceId ?? args.instance_id,
      args.projectType ?? args.project_type,
      args.fileName ?? args.file_name,
      args.enabled,
    ),
  delete_addon: (args) =>
    MyGo.DiscoveryService.deleteAddon(
      args.instanceId ?? args.instance_id,
      args.projectType ?? args.project_type,
      args.fileName ?? args.file_name,
    ),
  check_addon_updates: (args) =>
    MyGo.DiscoveryService.checkAddonUpdates(
      args.instanceId ?? args.instance_id ?? args.id,
      args.projectType ?? args.project_type,
    ),
  install_discovery_project: (args) =>
    MyGo.DiscoveryService.installDiscoveryProject(
      args.instanceId ?? args.instance_id,
      args.projectType ?? args.project_type,
      args.downloadUrl ?? args.download_url,
      args.fileName ?? args.file_name,
      args.provider ?? null,
      args.projectId ?? args.project_id ?? null,
      args.versionId ?? args.version_id ?? null,
      args.title ?? null,
      args.iconUrl ?? args.icon_url ?? null,
    ),

  // Modpacks
  inspect_modpack_file: (args) =>
    MyGo.ModpackService.inspectModpackFile(args.filePath),
  install_modpack_from_file: (args) =>
    MyGo.ModpackService.installModpackFromFile(
      args.filePath,
      args.customName ?? null,
      args.customIcon ?? null,
    ),
  install_modpack_from_discovery: (args) =>
    MyGo.ModpackService.installModpackFromDiscovery(
      args.downloadUrl,
      args.customName ?? null,
      args.customIcon ?? null,
    ),
  pick_modpack_file: () => MyGo.ModpackService.pickModpackFile(),

  // Downloads
  get_active_downloads: () => MyGo.DownloadService.getActiveDownloads(),
  pause_download: (args) => MyGo.DownloadService.pauseDownload(args.id),
  resume_download: (args) => MyGo.DownloadService.resumeDownload(args.id),
  stop_download: (args) => MyGo.DownloadService.stopDownload(args.id),

  // Worlds
  get_instance_worlds: (args) => MyGo.WorldService.getInstanceWorlds(args.id),
  create_world_backup: (args) =>
    MyGo.WorldService.createWorldBackup(args.id, args.folderName),
  get_instance_world_backups: (args) =>
    MyGo.WorldService.getInstanceWorldBackups(args.id),
  delete_world_backup: (args) =>
    MyGo.WorldService.deleteWorldBackup(args.id, args.backupFileName),
  restore_world_backup: (args) =>
    MyGo.WorldService.restoreWorldBackup(args.id, args.backupFileName),
  delete_world_save: (args) =>
    MyGo.WorldService.deleteWorldSave(args.id, args.folderName),
  clone_world_save: (args) =>
    MyGo.WorldService.cloneWorldSave(args.id, args.folderName),
  import_world_zip: (args) =>
    MyGo.WorldService.importWorldZip(args.id, args.zipPath),

  // Servers
  get_instance_servers: (args) => MyGo.ServerService.getInstanceServers(args.id),
  save_instance_servers: (args) =>
    MyGo.ServerService.saveInstanceServers(args.id, args.servers),
  ping_minecraft_server: (args) =>
    MyGo.ServerService.pingMinecraftServer(args.address),

  // Visuals
  get_active_resource_packs: (args) =>
    MyGo.VisualService.getActiveResourcePacks(args.id),
  set_active_resource_packs: (args) =>
    MyGo.VisualService.setActiveResourcePacks(args.id, args.activePacks),
  get_active_shader_pack: (args) =>
    MyGo.VisualService.getActiveShaderPack(args.id),
  set_active_shader_pack: (args) =>
    MyGo.VisualService.setActiveShaderPack(args.id, args.shaderPack ?? null),

  // Safety, Export & Ingestion
  validate_instance_safety: (args) =>
    MyGo.SafetyService.validateInstanceSafety(args.id),
  resolve_instance_dependencies: (args) =>
    MyGo.SafetyService.resolveInstanceDependencies(args.id),
  export_instance: (args) => MyGo.ExportService.exportInstance(args.options),
  ingest_dropped_files: (args) =>
    MyGo.IngestService.ingestDroppedFiles(args.id, args.paths),
};

/**
 * invoke provides drop-in compatibility for Tauri invoke calls,
 * routing requests to MyGo services.
 */
export async function invoke<T = any>(command: string, args?: any): Promise<T> {
  const handler = COMMAND_MAP[command];
  if (!handler) {
    return Promise.resolve([] as any);
  }
  return handler(args) as Promise<T>;
}

type EventMap = Record<string, { on: (cb: (payload: any) => void) => () => void }>;

function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/**
 * listen provides drop-in compatibility for Tauri event subscriptions,
 * routing them to MyGo event listeners.
 */
export function listen<T = any>(
  eventName: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  const events = (MyGo as Record<string, any>).events as EventMap | undefined;
  const target = events?.[eventName] || events?.[toCamelCase(eventName)];
  if (target && typeof target.on === "function") {
    const unsub = target.on((data: T) => handler({ payload: data }));
    return Promise.resolve(unsub);
  }
  return Promise.resolve(() => {});
}

/** Open external URLs in the user's default browser. */
export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank");
}

/** Mock getCurrentWindow for frameless window controls. */
export function getCurrentWindow() {
  return {
    setDecorations: async () => {},
    toggleMaximize: async () => {},
    startDragging: async () => {},
    minimize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    onResized: async (_fn: () => void) => () => {},
  };
}
