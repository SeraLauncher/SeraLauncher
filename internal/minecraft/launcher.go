package minecraft

import (
	"bufio"
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
	"strings"
	"sync"
	"time"

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
)

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

// GetSessionLogs returns captured session logs for an instance.
func GetSessionLogs(id string) string {
	sessionLogsMu.Lock()
	defer sessionLogsMu.Unlock()
	return sessionLogs[id]
}

func appendLog(id, line string) {
	sessionLogsMu.Lock()
	defer sessionLogsMu.Unlock()
	prev := sessionLogs[id]
	if len(prev) > 500000 {
		prev = prev[len(prev)-250000:]
	}
	sessionLogs[id] = prev + line + "\n"
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

	gameDir := filepath.Join(instDir, "minecraft")
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

	go func() {
		scanner := bufio.NewScanner(io.MultiReader(stdout, stderr))
		for scanner.Scan() {
			appendLog(id, scanner.Text())
		}
	}()

	go func() {
		_ = cmd.Wait()
		runningMu.Lock()
		delete(runningInstances, id)
		runningMu.Unlock()
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
