package api

import (
	"strings"

	"serago/internal/auth"
	"serago/internal/discord"
	"serago/internal/discovery"
	"serago/internal/downloader"
	"serago/internal/export"
	"serago/internal/fonts"
	"serago/internal/ingest"
	"serago/internal/instances"
	"serago/internal/java"
	"serago/internal/loaders"
	"serago/internal/minecraft"
	"serago/internal/modpack"
	"serago/internal/safety"
	"serago/internal/servers"
	"serago/internal/settings"
	"serago/internal/system"
	"serago/internal/visuals"
	"serago/internal/worlds"

	"github.com/egoist/mygo/plugins/updater"
)

// SettingsService handles user configuration persistence.
type SettingsService struct{}

func (SettingsService) LoadSettings() settings.Settings {
	return settings.Load()
}

func (SettingsService) SaveSettings(cfg settings.Settings) error {
	err := settings.Save(cfg)
	if err == nil {
		discord.SetConfig(cfg.DiscordRpc, cfg.DiscordDetailed)
	}
	return err
}

// SystemService exposes host system capabilities.
type SystemService struct{}

func (SystemService) ListFonts() []string {
	return fonts.Installed()
}

func (SystemService) GetSystemMemory() uint32 {
	return system.TotalMemoryMB()
}

// DiscordService handles navigation presence reporting.
type DiscordService struct{}

func (DiscordService) SetDiscordNavigation(status *string) {
	discord.SetNavigation(status)
}

func (DiscordService) GetDiscordStatus() string {
	return discord.GetStatus()
}

func (DiscordService) ReconnectDiscord() string {
	return discord.Reconnect()
}

func (DiscordService) DisconnectDiscord() string {
	return discord.Disconnect()
}

// JavaService handles runtime discovery, validation, and Adoptium installation.
type JavaService struct{}

func (JavaService) ListRuntimes() []java.JavaRuntime {
	return java.DiscoverRuntimes()
}

func (JavaService) ValidateJavaPath(path string) (*java.JavaRuntime, error) {
	return java.InspectBinary(path)
}

func (JavaService) GetRequiredVersion(mcVersion string) uint32 {
	return java.RequiredVersion(mcVersion)
}

func (JavaService) GetManagedRuntimes() ([]java.ManagedJavaRuntime, error) {
	return java.GetManagedRuntimes()
}

func (JavaService) UninstallManagedRuntime(majorVersion uint32) error {
	return java.UninstallManagedRuntime(majorVersion)
}

func (JavaService) InstallAdoptium(majorVersion uint32) (*java.JavaRuntime, error) {
	return java.InstallAdoptiumRuntime(majorVersion)
}

// AuthService handles user profiles, offline logins, Microsoft OAuth, and skins.
type AuthService struct{}

func (AuthService) GetActiveAccount() *auth.PublicAccount {
	return auth.GetActiveAccount()
}

func (AuthService) GetAllAccounts() []auth.PublicAccount {
	return auth.GetAllAccounts()
}

func (AuthService) SetActiveAccount(id string) error {
	return auth.SetActiveAccount(id)
}

func (AuthService) RemoveAccount(id string) error {
	return auth.RemoveAccount(id)
}

func (AuthService) AddOfflineAccount(username string) (auth.PublicAccount, error) {
	return auth.AddOfflineAccount(username)
}

func (AuthService) StartMicrosoftLogin() (auth.DeviceCodeResponse, error) {
	return auth.StartDeviceCodeFlow()
}

func (AuthService) PollMicrosoftLogin(deviceCode string) (auth.PublicAccount, error) {
	return auth.PollDeviceCode(deviceCode)
}

func (AuthService) LoginElyBy(username, password string) (auth.PublicAccount, error) {
	return auth.LoginElyBy(username, password)
}

func (AuthService) LoginLittleSkin(username, password string) (auth.PublicAccount, error) {
	return auth.LoginLittleSkin(username, password)
}

func (AuthService) RefreshAccountSkins() (*auth.PublicAccount, error) {
	return auth.RefreshAccountSkins()
}

func (AuthService) FetchSkinAsDataURL(url string) (string, error) {
	return auth.FetchSkinAsDataURL(url)
}

// InstanceService handles Minecraft instance management.
type InstanceService struct{}

func (InstanceService) ListInstances() ([]instances.Instance, error) {
	return instances.ListInstances()
}

type CreateInstanceArgs struct {
	Name          string  `json:"name"`
	McVersion     string  `json:"mcVersion"`
	VersionType   *string `json:"versionType"`
	Icon          *string `json:"icon"`
	Loader        *string `json:"loader"`
	LoaderVersion *string `json:"loaderVersion"`
}

func (InstanceService) CreateInstance(args CreateInstanceArgs) (instances.Instance, error) {
	inst, err := instances.CreateInstance(
		args.Name,
		args.McVersion,
		args.VersionType,
		args.Icon,
		args.Loader,
		args.LoaderVersion,
	)
	if err == nil {
		_ = InstancesChanged.Broadcast("changed")
	}
	return inst, err
}

func (InstanceService) UpdateInstance(inst instances.Instance) (instances.Instance, error) {
	updated, err := instances.UpdateInstance(inst)
	if err == nil {
		_ = InstancesChanged.Broadcast("changed")
	}
	return updated, err
}

func (InstanceService) DeleteInstance(id string) error {
	err := instances.DeleteInstance(id)
	if err == nil {
		_ = InstancesChanged.Broadcast("changed")
	}
	return err
}

func (InstanceService) GetScreenshots(id string) ([]instances.ScreenshotItem, error) {
	return instances.GetScreenshots(id)
}

func (InstanceService) DeleteScreenshot(id, fileName string) error {
	return instances.DeleteScreenshot(id, fileName)
}

func (InstanceService) OpenFolder(id string, subfolder *string) error {
	return instances.OpenFolder(id, subfolder)
}

func (InstanceService) GetInstancePath(id string) (string, error) {
	return instances.GetInstanceDir(id)
}

// MinecraftService handles game versions, process execution, and session logs.
type MinecraftService struct{}

func (MinecraftService) GetMinecraftVersions() (minecraft.MinecraftVersionsResponse, error) {
	return minecraft.FetchMinecraftVersions()
}

func (MinecraftService) FetchMinecraftNews(pageSize uint32) (minecraft.NewsResponse, error) {
	return minecraft.FetchMinecraftNews(pageSize)
}

func (MinecraftService) LaunchInstance(id string) error {
	err := minecraft.LaunchInstance(id, nil, nil)
	if err == nil {
		_ = RunningInstancesChanged.Broadcast(minecraft.ListRunningInstances())
	}
	return err
}

func (MinecraftService) LaunchInstanceQuickPlay(id string, quickPlayType string, target string) error {
	var sp, mp *string
	if strings.ToLower(quickPlayType) == "singleplayer" {
		sp = &target
	} else if strings.ToLower(quickPlayType) == "multiplayer" {
		mp = &target
	}
	err := minecraft.LaunchInstance(id, sp, mp)
	if err == nil {
		_ = RunningInstancesChanged.Broadcast(minecraft.ListRunningInstances())
	}
	return err
}

func (MinecraftService) GetRunningInstances() []minecraft.RunningInstanceInfo {
	return minecraft.ListRunningInstances()
}

func (MinecraftService) KillInstance(id string) error {
	err := minecraft.KillInstance(id)
	_ = RunningInstancesChanged.Broadcast(minecraft.ListRunningInstances())
	return err
}

func (MinecraftService) GetInstanceLogs(id string) string {
	return minecraft.GetSessionLogs(id)
}

func (MinecraftService) BuildHorizonNativeMods(id string) error {
	return minecraft.BuildHorizonNativeMods(id)
}

func (MinecraftService) GetHorizonNativeBuildStatus(id string) (minecraft.NativeBuildStatus, error) {
	return minecraft.GetHorizonNativeBuildStatus(id)
}

func (MinecraftService) GetHorizonEngineVersion(id string) (minecraft.HorizonEngineVersionInfo, error) {
	return minecraft.GetHorizonEngineVersion(id)
}

func (MinecraftService) UpdateHorizonEngine(id string) (minecraft.HorizonEngineVersionInfo, error) {
	info, err := minecraft.UpdateHorizonEngine(id)
	if err == nil {
		_ = InstancesChanged.Broadcast("changed")
	}
	return info, err
}

// LoaderService handles Fabric, Quilt, and Forge version resolution and installation.
type LoaderService struct{}

func (LoaderService) GetModLoaderVersions(mcVersion, loader string) ([]loaders.LoaderVersionInfo, error) {
	return loaders.FetchLoaderVersions(mcVersion, loader)
}

func (LoaderService) InstallModLoader(instanceID, loader, loaderVersion string) (instances.Instance, error) {
	return loaders.InstallModLoader(instanceID, loader, loaderVersion)
}

// DiscoveryService handles addon search, project details, versions, and installation.
type DiscoveryService struct{}

type SearchDiscoveryArgs struct {
	Provider    string  `json:"provider"`
	ProjectType string  `json:"projectType"`
	Query       *string `json:"query"`
	McVersion   *string `json:"mcVersion"`
	Loader      *string `json:"loader"`
	Offset      uint32  `json:"offset"`
	Limit       uint32  `json:"limit"`
}

func (DiscoveryService) SearchDiscovery(args SearchDiscoveryArgs) (discovery.DiscoverySearchResponse, error) {
	return discovery.SearchProjects(
		args.Provider,
		args.ProjectType,
		args.Query,
		args.McVersion,
		args.Loader,
		args.Offset,
		args.Limit,
	)
}

func (DiscoveryService) GetDiscoveryProjectDetails(provider, projectID string) (discovery.DiscoveryProjectDetails, error) {
	return discovery.GetProjectDetails(provider, projectID)
}

func (DiscoveryService) GetDiscoveryProjectVersions(provider, projectID string, mcVersion, loader *string) ([]discovery.DiscoveryVersion, error) {
	return discovery.GetProjectVersions(provider, projectID, mcVersion, loader)
}

func (DiscoveryService) GetInstalledAddonsList(instanceID, projectType string) ([]discovery.InstalledAddonItem, error) {
	return discovery.GetInstalledAddonsList(instanceID, projectType)
}

func (DiscoveryService) GetInstalledAddonIDs(instanceID, projectType string) ([]string, error) {
	return discovery.GetInstalledAddonIDs(instanceID, projectType)
}

func (DiscoveryService) ToggleAddonEnabled(instanceID, projectType, fileName string, enabled bool) (string, error) {
	return discovery.ToggleAddonEnabled(instanceID, projectType, fileName, enabled)
}

func (DiscoveryService) DeleteAddon(instanceID, projectType, fileName string) error {
	return discovery.DeleteAddon(instanceID, projectType, fileName)
}

func (DiscoveryService) CheckAddonUpdates(instanceID, projectType string) ([]discovery.AddonUpdateInfo, error) {
	return discovery.CheckAddonUpdates(instanceID, projectType)
}

func (DiscoveryService) InstallDiscoveryProject(
	instanceID, projectType, downloadURL, fileName string,
	provider, projectID, versionID, title, iconURL *string,
) ([]string, error) {
	return discovery.InstallDiscoveryProject(
		instanceID, projectType, downloadURL, fileName,
		provider, projectID, versionID, title, iconURL,
	)
}

// WorldService handles singleplayer world saves, backups, restores, and imports.
type WorldService struct{}

func (WorldService) GetInstanceWorlds(id string) ([]worlds.WorldItem, error) {
	return worlds.ListWorlds(id)
}

func (WorldService) CreateWorldBackup(id, folderName string) (worlds.WorldBackupItem, error) {
	return worlds.CreateBackup(id, folderName)
}

func (WorldService) GetInstanceWorldBackups(id string) ([]worlds.WorldBackupItem, error) {
	return worlds.ListBackups(id)
}

func (WorldService) DeleteWorldBackup(id, backupFileName string) error {
	return worlds.DeleteBackup(id, backupFileName)
}

func (WorldService) RestoreWorldBackup(id, backupFileName string) error {
	return worlds.RestoreBackup(id, backupFileName)
}

func (WorldService) DeleteWorldSave(id, folderName string) error {
	return worlds.DeleteSave(id, folderName)
}

func (WorldService) CloneWorldSave(id, folderName string) (worlds.WorldItem, error) {
	return worlds.CloneSave(id, folderName)
}

func (WorldService) ImportWorldZip(id, zipPath string) (worlds.WorldItem, error) {
	return worlds.ImportWorldZip(id, zipPath)
}

// ServerService handles server lists and Minecraft server pinging.
type ServerService struct{}

func (ServerService) GetInstanceServers(id string) ([]servers.ServerEntry, error) {
	return servers.GetServers(id)
}

func (ServerService) SaveInstanceServers(id string, serversList []servers.ServerEntry) error {
	return servers.SaveServers(id, serversList)
}

func (ServerService) PingMinecraftServer(address string) (servers.ServerPingResult, error) {
	return servers.PingServer(address)
}

// UpdateService exposes the MyGo updater subsystem to the frontend.
type UpdateService struct{}

func (UpdateService) CheckForUpdates() {
	updater.CheckForUpdates()
}

func (UpdateService) AvailableVersion() string {
	return updater.AvailableVersion()
}

func (UpdateService) AutomaticChecks() bool {
	return updater.AutomaticChecks()
}

func (UpdateService) SetAutomaticChecks(enabled bool) {
	updater.SetAutomaticChecks(enabled)
}

// VisualService manages resource pack order and shader packs.
type VisualService struct{}

func (VisualService) GetActiveResourcePacks(id string) ([]string, error) {
	return visuals.GetActiveResourcePacks(id)
}

func (VisualService) SetActiveResourcePacks(id string, packs []string) error {
	return visuals.SetActiveResourcePacks(id, packs)
}

func (VisualService) GetActiveShaderPack(id string) (*string, error) {
	return visuals.GetActiveShaderPack(id)
}

func (VisualService) SetActiveShaderPack(id string, shader *string) error {
	return visuals.SetActiveShaderPack(id, shader)
}

// ModpackService handles inspection and extraction of modpacks.
type ModpackService struct{}

func (ModpackService) InspectModpackFile(filePath string) (modpack.ModpackInspection, error) {
	return modpack.InspectModpackFile(filePath)
}

func (ModpackService) InstallModpackFromFile(filePath string, customName, customIcon *string) (instances.Instance, error) {
	return modpack.InstallModpackFromFile(filePath, customName, customIcon)
}

func (ModpackService) InstallModpackFromDiscovery(downloadURL string, customName, customIcon *string) (instances.Instance, error) {
	return modpack.InstallModpackFromURL(downloadURL, customName, customIcon)
}

func (ModpackService) PickModpackFile() (*string, error) {
	return modpack.PickModpackFile()
}

// DownloadService handles file download queue controls.
type DownloadService struct{}

func (DownloadService) GetActiveDownloads() []downloader.DownloadItem {
	return downloader.ListDownloads()
}

func (DownloadService) PauseDownload(id string) {
	downloader.PauseDownload(id)
	_ = DownloadsChanged.Broadcast(downloader.ListDownloads())
}

func (DownloadService) ResumeDownload(id string) {
	downloader.ResumeDownload(id)
	_ = DownloadsChanged.Broadcast(downloader.ListDownloads())
}

func (DownloadService) StopDownload(id string) {
	downloader.StopDownload(id)
	_ = DownloadsChanged.Broadcast(downloader.ListDownloads())
}

// SafetyService handles dependency validation and conflict resolution.
type SafetyService struct{}

func (SafetyService) ValidateInstanceSafety(id string) (safety.SafetyReport, error) {
	return safety.ValidateInstanceSafety(id)
}

func (SafetyService) ResolveInstanceDependencies(id string) ([]string, error) {
	return safety.ResolveInstanceDependencies(id)
}

// ExportService handles instance packaging.
type ExportService struct{}

func (ExportService) ExportInstance(opts export.ExportOptions) (export.ExportResult, error) {
	return export.ExportInstance(opts)
}

// IngestService handles dragged external files.
type IngestService struct{}

func (IngestService) IngestDroppedFiles(id string, paths []string) ([]ingest.IngestedItem, error) {
	return ingest.IngestDroppedFiles(id, paths)
}
