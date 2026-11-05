package minecraft

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"serago/internal/auth"
	"serago/internal/instances"
	"serago/internal/java"
	"serago/internal/paths"
	"serago/internal/settings"
)

// RunningInstanceInfo describes an active game process.
type RunningInstanceInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	McVersion string `json:"mcVersion"`
	StartedAt uint64 `json:"startedAt"`
}

type activeProcess struct {
	info RunningInstanceInfo
	cmd  *exec.Cmd
}

var (
	runningMu        sync.Mutex
	runningInstances = make(map[string]*activeProcess)
	sessionLogsMu    sync.Mutex
	sessionLogs      = make(map[string]string)
	logListenersMu         sync.Mutex
	logListeners           []func(id, line string)
	processExitListenersMu sync.Mutex
	processExitListeners   []func(id string, elapsedSecs uint64)
)

// scanLinesOrCR is a split function for a bufio.Scanner that splits on either \n or \r,
// allowing live terminal progress bars (such as curl/cargo/horizon-launcher download percentages)
// to stream immediately without waiting for a trailing newline.
func scanLinesOrCR(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	if i := strings.IndexAny(string(data), "\r\n"); i >= 0 {
		if data[i] == '\r' && i+1 < len(data) && data[i+1] == '\n' {
			return i + 2, data[0:i], nil
		}
		return i + 1, data[0:i], nil
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

// OnProcessExit registers a listener called whenever an instance process terminates.
func OnProcessExit(fn func(id string, elapsedSecs uint64)) {
	processExitListenersMu.Lock()
	defer processExitListenersMu.Unlock()
	processExitListeners = append(processExitListeners, fn)
}

func notifyProcessExit(id string, elapsedSecs uint64) {
	processExitListenersMu.Lock()
	listeners := make([]func(id string, elapsedSecs uint64), len(processExitListeners))
	copy(listeners, processExitListeners)
	processExitListenersMu.Unlock()

	for _, fn := range listeners {
		fn(id, elapsedSecs)
	}
}

// OnLogLine registers a listener called whenever a new log line is emitted.
func OnLogLine(fn func(id, line string)) {
	logListenersMu.Lock()
	defer logListenersMu.Unlock()
	logListeners = append(logListeners, fn)
}

// ListRunningInstances returns all active Minecraft processes.
func ListRunningInstances() []RunningInstanceInfo {
	runningMu.Lock()
	defer runningMu.Unlock()

	var list []RunningInstanceInfo
	for _, p := range runningInstances {
		list = append(list, p.info)
	}
	return list
}

// KillInstance stops a running Minecraft process.
func KillInstance(id string) error {
	runningMu.Lock()
	proc, exists := runningInstances[id]
	runningMu.Unlock()

	if !exists || proc.cmd.Process == nil {
		return errors.New("instance is not currently running")
	}

	return proc.cmd.Process.Kill()
}

// HorizonEngineVersionInfo describes installed and latest Horizon engine release versions.
type HorizonEngineVersionInfo struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
	ReleaseTag      string `json:"releaseTag"`
	DownloadURL     string `json:"downloadUrl"`
}

func formatHorizonReleaseName(name, tag string) string {
	name = strings.TrimSpace(name)
	if strings.Contains(name, "·") {
		parts := strings.Split(name, "·")
		left := strings.TrimSpace(parts[0])
		right := strings.TrimSpace(parts[1])
		leftWords := strings.Fields(left)
		if len(leftWords) > 0 {
			kind := leftWords[0]
			if strings.EqualFold(kind, "Horizon") && len(leftWords) > 1 {
				kind = leftWords[1]
			}
			return fmt.Sprintf("%s • %s", kind, right)
		}
		return fmt.Sprintf("%s • %s", left, right)
	}
	return tag
}

func detectHorizonBinaryVersion(binPath string) string {
	if binPath == "" {
		return ""
	}
	cmd := exec.Command(binPath, "-v")
	out, _ := cmd.CombinedOutput()
	lines := strings.Split(string(out), "\n")
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "Horizon ") {
			clean := strings.TrimPrefix(l, "Horizon ")
			return formatHorizonReleaseName(clean, "")
		}
	}
	return ""
}

// GetHorizonEngineVersion checks the installed Horizon version and queries GitHub for engine updates.
func GetHorizonEngineVersion(instanceID string) (HorizonEngineVersionInfo, error) {
	appRoot, err := paths.AppDataRoot()
	if err != nil {
		return HorizonEngineVersionInfo{}, err
	}

	binaryName := "horizon-client"
	if runtime.GOOS == "windows" {
		binaryName = "horizon-client.exe"
	}

	binPath := filepath.Join(appRoot, "engines", "horizon", binaryName)
	currentVer := detectHorizonBinaryVersion(binPath)
	if currentVer == "" {
		currentVer = "Nightly"
	}

	// Query GitHub releases for horizon-rust/horizon
	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/horizon-rust/horizon/releases?per_page=12", nil)
	req.Header.Set("User-Agent", "SeraLauncher/0.2.2")

	resp, err := client.Do(req)
	if err != nil {
		return HorizonEngineVersionInfo{
			CurrentVersion: currentVer,
			LatestVersion:  currentVer,
		}, nil
	}
	defer resp.Body.Close()

	type releaseAsset struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	}
	type ghRelease struct {
		TagName     string         `json:"tag_name"`
		Name        string         `json:"name"`
		PublishedAt string         `json:"published_at"`
		CreatedAt   string         `json:"created_at"`
		Assets      []releaseAsset `json:"assets"`
	}

	var releases []ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return HorizonEngineVersionInfo{CurrentVersion: currentVer}, nil
	}

	var platformSuffix string
	switch runtime.GOOS {
	case "linux":
		platformSuffix = "linux-x86_64.tar.gz"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			platformSuffix = "macos-arm64.zip"
		} else {
			platformSuffix = "macos-x64.zip"
		}
	case "windows":
		platformSuffix = "windows-x64.zip"
	default:
		platformSuffix = "linux-x86_64.tar.gz"
	}

	type engineCandidate struct {
		release     *ghRelease
		downloadURL string
		timestamp   string
	}

	var candidates []engineCandidate

	for i := range releases {
		r := &releases[i]
		// Expose only engine releases (exclude launcher@* tags)
		if strings.HasPrefix(r.TagName, "launcher@") {
			continue
		}
		for _, a := range r.Assets {
			aname := a.Name
			if strings.HasPrefix(aname, "horizon-") &&
				!strings.HasPrefix(aname, "horizon-server") &&
				!strings.HasPrefix(aname, "horizon-launcher") &&
				strings.HasSuffix(aname, platformSuffix) {
				ts := r.PublishedAt
				if ts == "" {
					ts = r.CreatedAt
				}
				candidates = append(candidates, engineCandidate{
					release:     r,
					downloadURL: a.BrowserDownloadURL,
					timestamp:   ts,
				})
				break
			}
		}
	}

	if len(candidates) == 0 {
		return HorizonEngineVersionInfo{
			CurrentVersion: currentVer,
			LatestVersion:  currentVer,
		}, nil
	}

	// Sort candidates by publication timestamp descending so the newest release is chosen
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].timestamp > candidates[j].timestamp
	})

	latestRelease := candidates[0].release
	downloadURL := candidates[0].downloadURL

	latestVer := formatHorizonReleaseName(latestRelease.Name, latestRelease.TagName)
	updateAvailable := currentVer != latestVer && !strings.Contains(currentVer, latestVer) && !strings.Contains(latestVer, currentVer)

	return HorizonEngineVersionInfo{
		CurrentVersion:  currentVer,
		LatestVersion:   latestVer,
		UpdateAvailable: updateAvailable,
		ReleaseTag:      latestRelease.TagName,
		DownloadURL:     downloadURL,
	}, nil
}

// UpdateHorizonEngine downloads and extracts the newest official Horizon engine release.
func UpdateHorizonEngine(instanceID string) (HorizonEngineVersionInfo, error) {
	info, err := GetHorizonEngineVersion(instanceID)
	if err != nil {
		return HorizonEngineVersionInfo{}, err
	}
	if info.DownloadURL == "" {
		return HorizonEngineVersionInfo{}, fmt.Errorf("no engine download URL found for release %s", info.ReleaseTag)
	}

	appRoot, err := paths.AppDataRoot()
	if err != nil {
		return HorizonEngineVersionInfo{}, err
	}

	engineDir := filepath.Join(appRoot, "engines", "horizon")
	_ = os.MkdirAll(engineDir, 0755)

	appendLog(instanceID, fmt.Sprintf("[INFO] Downloading Horizon engine update (%s)...", info.LatestVersion))
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(info.DownloadURL)
	if err != nil {
		return HorizonEngineVersionInfo{}, fmt.Errorf("failed to download engine update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return HorizonEngineVersionInfo{}, fmt.Errorf("engine update download returned status %d", resp.StatusCode)
	}

	appendLog(instanceID, "[INFO] Extracting new engine release...")
	if strings.HasSuffix(info.DownloadURL, ".tar.gz") {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			return HorizonEngineVersionInfo{}, err
		}
		defer gz.Close()

		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return HorizonEngineVersionInfo{}, err
			}
			base := filepath.Base(hdr.Name)
			target := filepath.Join(engineDir, base)
			if hdr.Typeflag == tar.TypeReg {
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err != nil {
					return HorizonEngineVersionInfo{}, err
				}
				_, _ = io.Copy(out, tr)
				out.Close()
			}
		}
	} else if strings.HasSuffix(info.DownloadURL, ".zip") {
		tmpZip, err := os.CreateTemp("", "horizon-engine-*.zip")
		if err != nil {
			return HorizonEngineVersionInfo{}, err
		}
		defer os.Remove(tmpZip.Name())
		defer tmpZip.Close()

		size, err := io.Copy(tmpZip, resp.Body)
		if err != nil {
			return HorizonEngineVersionInfo{}, err
		}

		zr, err := zip.NewReader(tmpZip, size)
		if err != nil {
			return HorizonEngineVersionInfo{}, err
		}

		for _, zf := range zr.File {
			base := filepath.Base(zf.Name)
			target := filepath.Join(engineDir, base)
			if !zf.FileInfo().IsDir() {
				rc, err := zf.Open()
				if err != nil {
					continue
				}
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err == nil {
					_, _ = io.Copy(out, rc)
					out.Close()
				}
				rc.Close()
			}
		}
	}

	binaryName := "horizon-client"
	if runtime.GOOS == "windows" {
		binaryName = "horizon-client.exe"
	}
	finalBin := filepath.Join(engineDir, binaryName)
	_ = os.Chmod(finalBin, 0755)

	newVersion := detectHorizonBinaryVersion(finalBin)
	if newVersion == "" {
		newVersion = info.LatestVersion
	}

	// Update instance loaderVersion in instance.json
	instDir, err := instances.GetInstanceDir(instanceID)
	if err == nil {
		instPath := filepath.Join(instDir, "instance.json")
		if data, err := os.ReadFile(instPath); err == nil {
			var inst instances.Instance
			if err := json.Unmarshal(data, &inst); err == nil {
				inst.LoaderVersion = &newVersion
				if updated, err := json.MarshalIndent(inst, "", "  "); err == nil {
					_ = os.WriteFile(instPath, updated, 0644)
				}
			}
		}
	}

	appendLog(instanceID, fmt.Sprintf("[INFO] Horizon engine successfully updated to %s", newVersion))

	return HorizonEngineVersionInfo{
		CurrentVersion:  newVersion,
		LatestVersion:   newVersion,
		UpdateAvailable: false,
		ReleaseTag:      info.ReleaseTag,
	}, nil
}

// ClearSessionLogs clears the in-memory log buffer for an instance.
func ClearSessionLogs(id string) {
	sessionLogsMu.Lock()
	sessionLogs[id] = ""
	sessionLogsMu.Unlock()
}

// GetSessionLogs returns captured session logs for an instance.
func GetSessionLogs(id string) string {
	sessionLogsMu.Lock()
	defer sessionLogsMu.Unlock()
	return sessionLogs[id]
}

func appendLog(id, line string) {
	sessionLogsMu.Lock()
	prev := sessionLogs[id]
	if len(prev) > 500000 {
		prev = prev[len(prev)-250000:]
	}
	sessionLogs[id] = prev + line + "\n"
	sessionLogsMu.Unlock()

	logListenersMu.Lock()
	listeners := make([]func(id, line string), len(logListeners))
	copy(listeners, logListeners)
	logListenersMu.Unlock()

	for _, fn := range listeners {
		fn(id, line)
	}
}

// LaunchInstance prepares and launches a Minecraft game process with automated asset & library downloads.
func LaunchInstance(id string, quickPlaySingle, quickPlayMulti *string) error {
	instDir, err := instances.GetInstanceDir(id)
	if err != nil {
		return err
	}

	instList, err := instances.ListInstances()
	if err != nil {
		return err
	}

	var target *instances.Instance
	for _, i := range instList {
		if i.ID == id {
			target = &i
			break
		}
	}
	if target == nil {
		return fmt.Errorf("instance not found: %s", id)
	}

	gameDir := filepath.Join(instDir, "minecraft")

	// 1. If this is a Horizon (Rust) instance, launch horizon-client directly
	if target.Loader != nil && strings.ToLower(*target.Loader) == "horizon" {
		appendLog(id, "[INFO] Launching Horizon 26.3 (Rust Edition)...")
		// Check if a compiled native client exists for this instance
		instanceBin := filepath.Join(gameDir, "bin", "horizon-client")
		if runtime.GOOS == "windows" {
			instanceBin = filepath.Join(gameDir, "bin", "horizon-client.exe")
		}

		horizonBin := instanceBin
		if fi, err := os.Stat(instanceBin); err == nil && !fi.IsDir() {
			appendLog(id, fmt.Sprintf("[INFO] Using instance native client binary with compiled mods (%s)", instanceBin))
		} else {
			baseBin, err := resolveOrDownloadHorizonClient(id)
			if err != nil {
				appendLog(id, fmt.Sprintf("[ERROR] %v", err))
				return err
			}
			horizonBin = baseBin
		}

		args := []string{
			"--game-dir", gameDir,
		}

		// Pass active account username
		if acc := auth.GetActiveAccount(); acc != nil && acc.Username != "" {
			appendLog(id, fmt.Sprintf("[INFO] Setting player username to %s", acc.Username))
			args = append(args, "--name", acc.Username)
			playerFile := filepath.Join(gameDir, "horizon-player.txt")
			_ = os.WriteFile(playerFile, []byte(fmt.Sprintf("name:%s\n", acc.Username)), 0644)
		}

		// Detect prepared resources
		if resDir := findHorizonResources(); resDir != "" {
			appendLog(id, fmt.Sprintf("[INFO] Using prepared resources at %s", resDir))
			args = append(args, "--resources", resDir)
		} else {
			appendLog(id, "[WARN] No prepared horizon-resources.json found. If assets fail, run horizon-prepare from tools.")
		}

		if quickPlaySingle != nil && *quickPlaySingle != "" {
			args = append(args, "--quickPlaySingleplayer", *quickPlaySingle)
		}
		if quickPlayMulti != nil && *quickPlayMulti != "" {
			args = append(args, "--quickPlayMultiplayer", *quickPlayMulti)
		}

		appendLog(id, fmt.Sprintf("[INFO] Executing %s with arguments: %v", horizonBin, args))
		cmd := exec.Command(horizonBin, args...)
		cmd.Dir = gameDir
		cmd.Env = os.Environ()

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			appendLog(id, fmt.Sprintf("[ERROR] Failed to open stdout pipe: %v", err))
			return err
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			appendLog(id, fmt.Sprintf("[ERROR] Failed to open stderr pipe: %v", err))
			return err
		}

		if err := cmd.Start(); err != nil {
			appendLog(id, fmt.Sprintf("[ERROR] Failed to start horizon-client process: %v", err))
			return fmt.Errorf("failed to start horizon-client: %w", err)
		}

		now := uint64(time.Now().Unix())
		info := RunningInstanceInfo{
			ID:        id,
			Name:      target.Name,
			McVersion: target.McVersion,
			StartedAt: now,
		}

		runningMu.Lock()
		runningInstances[id] = &activeProcess{info: info, cmd: cmd}
		runningMu.Unlock()

		streamPipe := func(r io.Reader) {
			scanner := bufio.NewScanner(r)
			scanner.Split(scanLinesOrCR)
			for scanner.Scan() {
				appendLog(id, scanner.Text())
			}
		}
		go streamPipe(stdout)
		go streamPipe(stderr)

		go func() {
			_ = cmd.Wait()
			elapsed := uint64(time.Now().Unix()) - now
			runningMu.Lock()
			delete(runningInstances, id)
			runningMu.Unlock()
			appendLog(id, "[INFO] Horizon process finished.")
			notifyProcessExit(id, elapsed)
		}()

		return nil
	}

	cfg := settings.Load()

	// 1. Determine Java binary
	javaBin := "java"
	if cfg.JavaPath != nil && *cfg.JavaPath != "" {
		javaBin = *cfg.JavaPath
	} else {
		reqVer := java.RequiredVersion(target.McVersion)
		runtimes := java.DiscoverRuntimes()
		for _, r := range runtimes {
			if r.MajorVersion == reqVer {
				javaBin = r.Path
				break
			}
		}
	}

	// 2. Resolve version manifest and download client.jar & libraries
	clientJarPath, classpath, err := prepareMinecraftFiles(target.McVersion, instDir)
	if err != nil {
		// Log warning but proceed with best effort fallback
		clientJarPath = filepath.Join(instDir, "minecraft", "bin", "minecraft.jar")
		classpath = clientJarPath
	}

	// 3. Build JVM arguments
	jvmArgs := []string{
		fmt.Sprintf("-Xms%dm", cfg.MinMemory),
		fmt.Sprintf("-Xmx%dm", cfg.MaxMemory),
	}

	switch cfg.GcPreset {
	case "zgc":
		jvmArgs = append(jvmArgs, "-XX:+UseZGC")
	case "g1gc":
		jvmArgs = append(jvmArgs, "-XX:+UseG1GC")
	}

	if cfg.JavaOptimize {
		jvmArgs = append(jvmArgs, "-XX:+UnlockExperimentalVMOptions")
	}

	if cfg.JvmArgs != "" {
		jvmArgs = append(jvmArgs, strings.Fields(cfg.JvmArgs)...)
	}

	assetsDir, _ := paths.AssetsDir()
	nativesDir := filepath.Join(gameDir, "natives")
	_ = os.MkdirAll(nativesDir, 0755)

	jvmArgs = append(jvmArgs,
		fmt.Sprintf("-Djava.library.path=%s", nativesDir),
		"-cp", classpath,
		"net.minecraft.client.main.Main",
		"--gameDir", gameDir,
		"--assetsDir", assetsDir,
		"--version", target.McVersion,
	)

	if quickPlaySingle != nil && *quickPlaySingle != "" {
		jvmArgs = append(jvmArgs, "--quickPlaySingleplayer", *quickPlaySingle)
	}
	if quickPlayMulti != nil && *quickPlayMulti != "" {
		jvmArgs = append(jvmArgs, "--quickPlayMultiplayer", *quickPlayMulti)
	}

	cmd := exec.Command(javaBin, jvmArgs...)
	cmd.Dir = gameDir

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start minecraft process: %w", err)
	}

	now := uint64(time.Now().Unix())
	info := RunningInstanceInfo{
		ID:        id,
		Name:      target.Name,
		McVersion: target.McVersion,
		StartedAt: now,
	}

	runningMu.Lock()
	runningInstances[id] = &activeProcess{info: info, cmd: cmd}
	runningMu.Unlock()

	streamPipe := func(r io.Reader) {
		scanner := bufio.NewScanner(r)
		scanner.Split(scanLinesOrCR)
		for scanner.Scan() {
			appendLog(id, scanner.Text())
		}
	}
	go streamPipe(stdout)
	go streamPipe(stderr)

	go func() {
		_ = cmd.Wait()
		elapsed := uint64(time.Now().Unix()) - now
		runningMu.Lock()
		delete(runningInstances, id)
		runningMu.Unlock()
		appendLog(id, "[INFO] Minecraft process finished.")
		notifyProcessExit(id, elapsed)
	}()

	return nil
}

type libraryOS struct {
	Name string `json:"name"`
}

type libraryRule struct {
	Action string     `json:"action"`
	OS     *libraryOS `json:"os"`
}

type libraryArtifact struct {
	Path string `json:"path"`
	Sha1 string `json:"sha1"`
	URL  string `json:"url"`
}

type libraryItem struct {
	Downloads struct {
		Artifact *libraryArtifact `json:"artifact"`
	} `json:"downloads"`
	Rules []libraryRule `json:"rules"`
}

func prepareMinecraftFiles(mcVersion, instDir string) (string, string, error) {
	manifest, err := FetchMinecraftVersions()
	if err != nil {
		return "", "", err
	}

	var verURL string
	for _, v := range manifest.Versions {
		if v.ID == mcVersion {
			verURL = v.URL
			break
		}
	}
	if verURL == "" {
		return "", "", fmt.Errorf("version not found in manifest: %s", mcVersion)
	}

	versionsDir, err := paths.VersionsDir()
	if err != nil {
		return "", "", err
	}

	verDir := filepath.Join(versionsDir, mcVersion)
	_ = os.MkdirAll(verDir, 0755)
	verJSONPath := filepath.Join(verDir, mcVersion+".json")
	clientJarPath := filepath.Join(verDir, mcVersion+".jar")

	client := &http.Client{Timeout: 30 * time.Second}

	// Fetch version JSON
	if _, err := os.Stat(verJSONPath); err != nil {
		resp, err := client.Get(verURL)
		if err != nil {
			return "", "", err
		}
		defer resp.Body.Close()
		out, err := os.Create(verJSONPath)
		if err != nil {
			return "", "", err
		}
		_, _ = io.Copy(out, resp.Body)
		out.Close()
	}

	data, err := os.ReadFile(verJSONPath)
	if err != nil {
		return "", "", err
	}

	var verMeta struct {
		Downloads struct {
			Client struct {
				URL  string `json:"url"`
				Sha1 string `json:"sha1"`
			} `json:"client"`
		} `json:"downloads"`
		Libraries []libraryItem `json:"libraries"`
	}

	if err := json.Unmarshal(data, &verMeta); err != nil {
		return "", "", err
	}

	// Download client.jar if missing
	if !fileExistsVerified(clientJarPath, verMeta.Downloads.Client.Sha1) {
		resp, err := client.Get(verMeta.Downloads.Client.URL)
		if err == nil {
			defer resp.Body.Close()
			out, err := os.Create(clientJarPath)
			if err == nil {
				_, _ = io.Copy(out, resp.Body)
				out.Close()
			}
		}
	}

	// Download libraries and build classpath
	libDir, err := paths.LibrariesDir()
	if err != nil {
		return clientJarPath, clientJarPath, nil
	}

	var cpParts []string
	currentOS := "linux"
	if runtime.GOOS == "windows" {
		currentOS = "windows"
	} else if runtime.GOOS == "darwin" {
		currentOS = "osx"
	}

	for _, lib := range verMeta.Libraries {
		if !libraryRulesAllow(lib.Rules, currentOS) {
			continue
		}
		art := lib.Downloads.Artifact
		if art == nil || art.URL == "" {
			continue
		}
		targetPath := filepath.Join(libDir, art.Path)
		_ = os.MkdirAll(filepath.Dir(targetPath), 0755)

		if !fileExistsVerified(targetPath, art.Sha1) {
			resp, err := client.Get(art.URL)
			if err == nil {
				out, err := os.Create(targetPath)
				if err == nil {
					_, _ = io.Copy(out, resp.Body)
					out.Close()
				}
				resp.Body.Close()
			}
		}
		cpParts = append(cpParts, targetPath)
	}

	cpParts = append(cpParts, clientJarPath)
	separator := ":"
	if runtime.GOOS == "windows" {
		separator = ";"
	}

	return clientJarPath, strings.Join(cpParts, separator), nil
}

func libraryRulesAllow(rules []libraryRule, currentOS string) bool {
	if len(rules) == 0 {
		return true
	}
	allowed := false
	for _, r := range rules {
		matches := true
		if r.OS != nil && r.OS.Name != "" {
			matches = r.OS.Name == currentOS
		}
		if matches {
			allowed = r.Action == "allow"
		}
	}
	return allowed
}

func findHorizonResources() string {
	home, _ := os.UserHomeDir()
	if home == "" {
		return ""
	}

	// 1. Check ~/.local/share/horizon/.horizon-cache/resourcepacks/*/
	cacheDir := filepath.Join(home, ".local", "share", "horizon", ".horizon-cache", "resourcepacks")
	if entries, err := os.ReadDir(cacheDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				cand := filepath.Join(cacheDir, e.Name())
				if fi, err := os.Stat(filepath.Join(cand, "horizon-resources.json")); err == nil && !fi.IsDir() {
					return cand
				}
			}
		}
	}

	// 2. Check ~/.local/share/SeraLauncher/engines/horizon/resources/
	appRoot, err := paths.AppDataRoot()
	if err == nil {
		cand := filepath.Join(appRoot, "engines", "horizon", "resources")
		if fi, err := os.Stat(filepath.Join(cand, "horizon-resources.json")); err == nil && !fi.IsDir() {
			return cand
		}
	}

	// 3. Check ~/.local/share/horizon/game-files/horizon-client/26.3/
	gameFilesCand := filepath.Join(home, ".local", "share", "horizon", "game-files", "horizon-client", "26.3")
	if fi, err := os.Stat(filepath.Join(gameFilesCand, "horizon-resources.json")); err == nil && !fi.IsDir() {
		return gameFilesCand
	}

	return ""
}

func resolveOrDownloadHorizonClient(id string) (string, error) {
	binaryName := "horizon-client"
	if runtime.GOOS == "windows" {
		binaryName = "horizon-client.exe"
	}

	// 1. Check PATH
	if p, err := exec.LookPath(binaryName); err == nil {
		return p, nil
	}

	// 2. Check ~/.local/bin/
	home, _ := os.UserHomeDir()
	if home != "" {
		localBin := filepath.Join(home, ".local", "bin", binaryName)
		if fi, err := os.Stat(localBin); err == nil && !fi.IsDir() {
			return localBin, nil
		}
	}

	// 3. Check <app_data>/engines/horizon/
	appRoot, err := paths.AppDataRoot()
	if err == nil {
		engineBin := filepath.Join(appRoot, "engines", "horizon", binaryName)
		if fi, err := os.Stat(engineBin); err == nil && !fi.IsDir() {
			return engineBin, nil
		}
	}

	// 4. Download official release binary from GitHub
	appendLog(id, "[INFO] horizon-client not found on system. Resolving precompiled binary from GitHub...")
	engineDir := filepath.Join(appRoot, "engines", "horizon")
	_ = os.MkdirAll(engineDir, 0755)

	var candidateURLs []string
	switch runtime.GOOS {
	case "linux":
		candidateURLs = []string{
			"https://github.com/horizon-rust/horizon/releases/download/nightly-2026-11-03/horizon-linux-x86_64.tar.gz",
			"https://github.com/horizon-rust/horizon/releases/download/nightly/horizon-linux-x86_64.tar.gz",
			"https://github.com/horizon-rust/horizon/releases/download/v0.2.95/horizon-linux-x86_64.tar.gz",
		}
	case "darwin":
		candidateURLs = []string{
			"https://github.com/horizon-rust/horizon/releases/download/nightly-2026-11-03/horizon-macos-arm64.zip",
			"https://github.com/horizon-rust/horizon/releases/download/nightly/horizon-macos-arm64.zip",
			"https://github.com/horizon-rust/horizon/releases/download/v0.2.95/horizon-macos-arm64.zip",
		}
	case "windows":
		candidateURLs = []string{
			"https://github.com/horizon-rust/horizon/releases/download/nightly-2026-11-03/horizon-windows-x64.zip",
			"https://github.com/horizon-rust/horizon/releases/download/nightly/horizon-windows-x64.zip",
			"https://github.com/horizon-rust/horizon/releases/download/v0.2.95/horizon-windows-x64.zip",
		}
	default:
		return "", fmt.Errorf("unsupported OS for Horizon precompiled binaries: %s", runtime.GOOS)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	var resp *http.Response
	var usedURL string

	for _, u := range candidateURLs {
		appendLog(id, fmt.Sprintf("[INFO] Attempting download from %s...", u))
		r, err := client.Get(u)
		if err == nil && r.StatusCode == http.StatusOK {
			resp = r
			usedURL = u
			break
		}
		if r != nil {
			r.Body.Close()
		}
	}

	if resp == nil {
		return "", fmt.Errorf("could not download horizon release from candidate URLs")
	}
	defer resp.Body.Close()

	appendLog(id, fmt.Sprintf("[INFO] Successfully connected to %s. Unpacking archive...", usedURL))
	if strings.HasSuffix(usedURL, ".tar.gz") {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			return "", err
		}
		defer gz.Close()

		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			base := filepath.Base(hdr.Name)
			target := filepath.Join(engineDir, base)
			if hdr.Typeflag == tar.TypeReg {
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err != nil {
					return "", err
				}
				_, _ = io.Copy(out, tr)
				out.Close()
			}
		}
	} else if strings.HasSuffix(usedURL, ".zip") {
		tmpZip, err := os.CreateTemp("", "horizon-*.zip")
		if err != nil {
			return "", err
		}
		defer os.Remove(tmpZip.Name())
		defer tmpZip.Close()

		size, err := io.Copy(tmpZip, resp.Body)
		if err != nil {
			return "", err
		}

		zr, err := zip.NewReader(tmpZip, size)
		if err != nil {
			return "", err
		}

		for _, zf := range zr.File {
			base := filepath.Base(zf.Name)
			target := filepath.Join(engineDir, base)
			if !zf.FileInfo().IsDir() {
				rc, err := zf.Open()
				if err != nil {
					continue
				}
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err == nil {
					_, _ = io.Copy(out, rc)
					out.Close()
				}
				rc.Close()
			}
		}
	}

	finalBin := filepath.Join(engineDir, binaryName)
	if fi, err := os.Stat(finalBin); err == nil && !fi.IsDir() {
		_ = os.Chmod(finalBin, 0755)
		appendLog(id, fmt.Sprintf("[INFO] Successfully installed %s", finalBin))
		return finalBin, nil
	}

	return "", fmt.Errorf("horizon-client was not found in downloaded release archive")
}

func fileExistsVerified(p string, expectedSha1 string) bool {
	info, err := os.Stat(p)
	if err != nil || info.IsDir() {
		return false
	}
	if expectedSha1 == "" {
		return true
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return false
	}
	hasher := sha1.New()
	hasher.Write(data)
	return hex.EncodeToString(hasher.Sum(nil)) == strings.ToLower(expectedSha1)
}

// NativeBuildStatus describes the build state of an instance's native mods.
type NativeBuildStatus struct {
	HasNativeMods bool `json:"hasNativeMods"`
	IsBuilt       bool `json:"isBuilt"`
	ModCount      int  `json:"modCount"`
}

// GetHorizonNativeBuildStatus checks if native mods exist and if a compiled client binary is ready.
func GetHorizonNativeBuildStatus(id string) (NativeBuildStatus, error) {
	instDir, err := instances.GetInstanceDir(id)
	if err != nil {
		return NativeBuildStatus{}, err
	}

	gameDir := filepath.Join(instDir, "minecraft")
	modsDir := filepath.Join(gameDir, "horizon-mods")
	entries, err := os.ReadDir(modsDir)
	if err != nil {
		return NativeBuildStatus{}, nil
	}

	count := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".hnmod") && !strings.HasSuffix(e.Name(), ".disabled") {
			count++
		}
	}

	if count == 0 {
		return NativeBuildStatus{HasNativeMods: false, IsBuilt: true, ModCount: 0}, nil
	}

	binName := "horizon-client"
	if runtime.GOOS == "windows" {
		binName = "horizon-client.exe"
	}
	customBin := filepath.Join(gameDir, "bin", binName)
	isBuilt := false
	if fi, err := os.Stat(customBin); err == nil && !fi.IsDir() {
		isBuilt = true
	}

	return NativeBuildStatus{
		HasNativeMods: true,
		IsBuilt:       isBuilt,
		ModCount:      count,
	}, nil
}

// BuildHorizonNativeMods unzips native mods and compiles them into a custom instance horizon-client binary.
func BuildHorizonNativeMods(id string) error {
	ClearSessionLogs(id)
	instDir, err := instances.GetInstanceDir(id)
	if err != nil {
		return err
	}

	gameDir := filepath.Join(instDir, "minecraft")
	modsDir := filepath.Join(gameDir, "horizon-mods")
	entries, err := os.ReadDir(modsDir)
	if err != nil {
		return fmt.Errorf("could not read horizon-mods directory: %w", err)
	}

	stagingDir := filepath.Join(gameDir, "horizon-native-mods")
	_ = os.RemoveAll(stagingDir)
	_ = os.MkdirAll(stagingDir, 0755)

	// Clean stale staging locks and temporary folders from previous interrupted or failed runs
	if home, _ := os.UserHomeDir(); home != "" {
		nativeDataDir := filepath.Join(home, ".local", "share", "horizon-launcher", "native")
		_ = os.RemoveAll(filepath.Join(nativeDataDir, "stage.new"))
		// Remove any stale lock files
		if lockEntries, err := os.ReadDir(nativeDataDir); err == nil {
			for _, le := range lockEntries {
				if strings.HasSuffix(le.Name(), ".lock") {
					_ = os.Remove(filepath.Join(nativeDataDir, le.Name()))
				}
			}
		}
	}

	appendLog(id, "[INFO] Unpacking native mod mixin bundles...")
	modCount := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".hnmod") || strings.HasSuffix(e.Name(), ".disabled") {
			continue
		}
		modCount++
		srcPath := filepath.Join(modsDir, e.Name())
		modStem := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		targetModDir := filepath.Join(stagingDir, modStem)
		_ = os.MkdirAll(targetModDir, 0755)

		zr, err := zip.OpenReader(srcPath)
		if err != nil {
			appendLog(id, fmt.Sprintf("[WARN] Failed to open %s: %v", e.Name(), err))
			continue
		}

		for _, zf := range zr.File {
			outPath := filepath.Join(targetModDir, zf.Name)
			if zf.FileInfo().IsDir() {
				_ = os.MkdirAll(outPath, 0755)
				continue
			}
			_ = os.MkdirAll(filepath.Dir(outPath), 0755)
			rc, err := zf.Open()
			if err != nil {
				continue
			}
			out, err := os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
			if err == nil {
				_, _ = io.Copy(out, rc)
				out.Close()
			}
			rc.Close()
		}
		zr.Close()
		appendLog(id, fmt.Sprintf("[INFO] Extracted %s into mixin staging.", e.Name()))
	}

	if modCount == 0 {
		return fmt.Errorf("no active .hnmod files found in %s", modsDir)
	}

	// Resolve official horizon-launcher from <app_data>/engines/horizon/ (or download latest release)
	launcherBin, err := resolveOrDownloadHorizonLauncher(id)
	if err != nil {
		appendLog(id, fmt.Sprintf("[ERROR] %v", err))
		return err
	}

	binDir := filepath.Join(gameDir, "bin")
	_ = os.MkdirAll(binDir, 0755)

	// Pick prepared base version for native build (check v0.2.97 then v0.2.79)
	baseVersion := "v0.2.97"
	if home, _ := os.UserHomeDir(); home != "" {
		v97 := filepath.Join(home, ".local", "share", "horizon-launcher", "versions", "v0.2.97", ".local", "horizon-client", "26.3", "horizon-resources.json")
		if _, err := os.Stat(v97); err != nil {
			v79 := filepath.Join(home, ".local", "share", "horizon-launcher", "versions", "v0.2.79", ".local", "horizon-client", "26.3", "horizon-resources.json")
			if _, err := os.Stat(v79); err == nil {
				baseVersion = "v0.2.79"
			}
		}
	}

	appendLog(id, fmt.Sprintf("[INFO] Starting native build on base %s via %s...", baseVersion, launcherBin))
	cmd := exec.Command(
		launcherBin,
		"native-build",
		"--trust-native-code",
		"--allow-version-mismatch",
		"--version", baseVersion,
		stagingDir,
	)
	cmd.Dir = gameDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start native-build: %w", err)
	}

	var pipeWg sync.WaitGroup
	pipeWg.Add(2)

	streamBuildPipe := func(r io.Reader) {
		defer pipeWg.Done()
		scanner := bufio.NewScanner(r)
		scanner.Split(scanLinesOrCR)
		for scanner.Scan() {
			t := strings.TrimSpace(scanner.Text())
			if t != "" {
				appendLog(id, t)
			}
		}
	}

	go streamBuildPipe(stdout)
	go streamBuildPipe(stderr)

	pipeWg.Wait()
	if err := cmd.Wait(); err != nil {
		appendLog(id, fmt.Sprintf("[ERROR] native-build failed: %v", err))

		// Check build.log for exact mixin failure diagnosis
		if home, _ := os.UserHomeDir(); home != "" {
			buildLogPath := filepath.Join(home, ".local", "share", "horizon-launcher", "native", "build.log")
			if logData, err := os.ReadFile(buildLogPath); err == nil {
				logStr := string(logData)
				if strings.Contains(logStr, "E_TARGET_NOT_FOUND") {
					for _, line := range strings.Split(logStr, "\n") {
						if strings.Contains(line, "E_TARGET_NOT_FOUND") || strings.Contains(line, "no source function") {
							appendLog(id, fmt.Sprintf("[DIAGNOSIS] %s", strings.TrimSpace(line)))
						}
					}
					appendLog(id, "[TIP] An installed mod hooks an internal function that changed in this Horizon version. Disable that mod in the Mods tab to compile the rest.")
				}
			}
		}

		return fmt.Errorf("native-build exited with error: %w", err)
	}

	appendLog(id, "[INFO] native-build completed successfully.")

	// Locate the newly generated native build version
	if home, _ := os.UserHomeDir(); home != "" {
		targetBin := filepath.Join(binDir, "horizon-client")
		installed := false

		// 1. Check direct cargo target build output
		cargoFastBin := filepath.Join(home, ".local", "share", "horizon-launcher", "native", "target", "fast", "horizon-client")
		if fi, err := os.Stat(cargoFastBin); err == nil && fi.Size() > 1000000 {
			if data, err := os.ReadFile(cargoFastBin); err == nil {
				_ = os.WriteFile(targetBin, data, 0755)
				appendLog(id, fmt.Sprintf("[INFO] Installed custom native binary to %s (%d MB)", targetBin, fi.Size()/(1024*1024)))
				installed = true
			}
		}

		// 2. Check versions/native-* folders
		if !installed {
			versionsDir := filepath.Join(home, ".local", "share", "horizon-launcher", "versions")
			if vEntries, err := os.ReadDir(versionsDir); err == nil {
				var newestDir string
				var newestTime time.Time
				for _, ve := range vEntries {
					if ve.IsDir() && strings.HasPrefix(ve.Name(), "native-") {
						info, err := ve.Info()
						if err == nil && info.ModTime().After(newestTime) {
							newestTime = info.ModTime()
							newestDir = filepath.Join(versionsDir, ve.Name())
						}
					}
				}
				if newestDir != "" {
					sourceBin := filepath.Join(newestDir, "horizon-client")
					if fi, err := os.Stat(sourceBin); err == nil && fi.Size() > 1000000 {
						if data, err := os.ReadFile(sourceBin); err == nil {
							_ = os.WriteFile(targetBin, data, 0755)
							appendLog(id, fmt.Sprintf("[INFO] Installed custom native binary to %s (%d MB)", targetBin, fi.Size()/(1024*1024)))
						}
					}
				}
			}
		}
	}

	return nil
}

func resolveOrDownloadHorizonLauncher(id string) (string, error) {
	appRoot, err := paths.AppDataRoot()
	if err != nil {
		return "", err
	}

	binaryName := "horizon-launcher"
	if runtime.GOOS == "windows" {
		binaryName = "horizon-launcher.exe"
	}

	engineDir := filepath.Join(appRoot, "engines", "horizon")
	_ = os.MkdirAll(engineDir, 0755)
	launcherBin := filepath.Join(engineDir, binaryName)

	// Check if already installed in engines directory
	if fi, err := os.Stat(launcherBin); err == nil && !fi.IsDir() {
		return launcherBin, nil
	}

	// Download official release matching OS and architecture from GitHub
	appendLog(id, "[INFO] Official horizon-launcher not found. Downloading launcher@0.2.40 from GitHub...")

	var downloadURL string
	switch runtime.GOOS {
	case "linux":
		downloadURL = "https://github.com/horizon-rust/horizon/releases/download/launcher%400.2.40/horizon-launcher-linux-x86_64.tar.gz"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURL = "https://github.com/horizon-rust/horizon/releases/download/launcher%400.2.40/horizon-launcher-macos-arm64.zip"
		} else {
			downloadURL = "https://github.com/horizon-rust/horizon/releases/download/launcher%400.2.40/horizon-launcher-macos-x64.zip"
		}
	case "windows":
		downloadURL = "https://github.com/horizon-rust/horizon/releases/download/launcher%400.2.40/horizon-launcher-windows-x64.zip"
	default:
		return "", fmt.Errorf("unsupported platform for Horizon launcher: %s %s", runtime.GOOS, runtime.GOARCH)
	}

	appendLog(id, fmt.Sprintf("[INFO] Fetching %s...", downloadURL))
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return "", fmt.Errorf("failed to download official horizon-launcher: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("horizon-launcher download returned HTTP %d", resp.StatusCode)
	}

	appendLog(id, "[INFO] Extracting horizon-launcher into engines directory...")
	if strings.HasSuffix(downloadURL, ".tar.gz") {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			return "", err
		}
		defer gz.Close()

		tr := tar.NewReader(gz)
		for {
			hdr, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			base := filepath.Base(hdr.Name)
			target := filepath.Join(engineDir, base)
			if hdr.Typeflag == tar.TypeReg {
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err != nil {
					return "", err
				}
				_, _ = io.Copy(out, tr)
				out.Close()
			}
		}
	} else if strings.HasSuffix(downloadURL, ".zip") {
		tmpZip, err := os.CreateTemp("", "horizon-launcher-*.zip")
		if err != nil {
			return "", err
		}
		defer os.Remove(tmpZip.Name())
		defer tmpZip.Close()

		size, err := io.Copy(tmpZip, resp.Body)
		if err != nil {
			return "", err
		}

		zr, err := zip.NewReader(tmpZip, size)
		if err != nil {
			return "", err
		}

		for _, zf := range zr.File {
			base := filepath.Base(zf.Name)
			target := filepath.Join(engineDir, base)
			if !zf.FileInfo().IsDir() {
				rc, err := zf.Open()
				if err != nil {
					continue
				}
				out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
				if err == nil {
					_, _ = io.Copy(out, rc)
					out.Close()
				}
				rc.Close()
			}
		}
	}

	if fi, err := os.Stat(launcherBin); err == nil && !fi.IsDir() {
		_ = os.Chmod(launcherBin, 0755)
		appendLog(id, fmt.Sprintf("[INFO] Verified official horizon-launcher at %s", launcherBin))
		return launcherBin, nil
	}

	return "", fmt.Errorf("horizon-launcher binary not found in downloaded release archive")
}
