package instances

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"serago/internal/paths"
)

// Instance holds user instance metadata stored in instance.json.
type Instance struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	McVersion     string  `json:"mcVersion"`
	VersionType   *string `json:"versionType"`
	Icon          *string `json:"icon"`
	Loader        *string `json:"loader"`
	LoaderVersion *string `json:"loaderVersion"`
	CreatedAt     string  `json:"createdAt"`
	LastPlayed    *string `json:"lastPlayed"`
	PlayTimeSecs  uint64  `json:"playTimeSecs"`
}

// ScreenshotItem describes a game screenshot.
type ScreenshotItem struct {
	FileName  string `json:"fileName"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

func generateID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ListInstances discovers and reads all instance.json files.
func ListInstances() ([]Instance, error) {
	dir, err := paths.InstancesDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var list []Instance
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		instFile := filepath.Join(dir, e.Name(), "instance.json")
		data, err := os.ReadFile(instFile)
		if err != nil {
			continue
		}
		var inst Instance
		if err := json.Unmarshal(data, &inst); err == nil {
			if inst.ID == "" {
				inst.ID = e.Name()
			}
			list = append(list, inst)
		}
	}
	return list, nil
}

// CreateInstance creates a new isolated instance directory with standard Minecraft folders.
func CreateInstance(name string, mcVersion string, versionType, icon, loader, loaderVersion *string) (Instance, error) {
	dir, err := paths.InstancesDir()
	if err != nil {
		return Instance{}, err
	}

	id := generateID()
	instDir := filepath.Join(dir, id)
	if err := os.MkdirAll(instDir, 0755); err != nil {
		return Instance{}, err
	}

	// Create standard game directory and subfolders
	gameDir := filepath.Join(instDir, "minecraft")
	for _, sub := range []string{"mods", "resourcepacks", "shaderpacks", "screenshots", "saves"} {
		_ = os.MkdirAll(filepath.Join(gameDir, sub), 0755)
	}

	now := fmt.Sprintf("%d", time.Now().Unix())
	inst := Instance{
		ID:            id,
		Name:          strings.TrimSpace(name),
		McVersion:     strings.TrimSpace(mcVersion),
		VersionType:   versionType,
		Icon:          icon,
		Loader:        loader,
		LoaderVersion: loaderVersion,
		CreatedAt:     now,
		PlayTimeSecs:  0,
	}

	data, err := json.MarshalIndent(inst, "", "  ")
	if err != nil {
		return Instance{}, err
	}

	if err := os.WriteFile(filepath.Join(instDir, "instance.json"), data, 0644); err != nil {
		return Instance{}, err
	}

	return inst, nil
}

// UpdateInstance updates metadata on an existing instance.
func UpdateInstance(inst Instance) (Instance, error) {
	dir, err := paths.InstancesDir()
	if err != nil {
		return Instance{}, err
	}

	instDir := filepath.Join(dir, inst.ID)
	if _, err := os.Stat(instDir); err != nil {
		return Instance{}, fmt.Errorf("instance not found: %s", inst.ID)
	}

	data, err := json.MarshalIndent(inst, "", "  ")
	if err != nil {
		return Instance{}, err
	}

	if err := os.WriteFile(filepath.Join(instDir, "instance.json"), data, 0644); err != nil {
		return Instance{}, err
	}

	return inst, nil
}

// DeleteInstance removes an instance directory permanently.
func DeleteInstance(id string) error {
	dir, err := paths.InstancesDir()
	if err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(dir, id))
}

// GetInstanceDir returns the absolute path to an instance directory.
func GetInstanceDir(id string) (string, error) {
	dir, err := paths.InstancesDir()
	if err != nil {
		return "", err
	}
	instDir := filepath.Join(dir, id)
	if _, err := os.Stat(instDir); err != nil {
		return "", errors.New("instance directory does not exist")
	}
	return instDir, nil
}

// GetScreenshots lists screenshots in `<instance>/minecraft/screenshots`.
func GetScreenshots(id string) ([]ScreenshotItem, error) {
	instDir, err := GetInstanceDir(id)
	if err != nil {
		return nil, err
	}

	screenDir := filepath.Join(instDir, "minecraft", "screenshots")
	entries, err := os.ReadDir(screenDir)
	if err != nil {
		return []ScreenshotItem{}, nil
	}

	var items []ScreenshotItem
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".png") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		items = append(items, ScreenshotItem{
			FileName:  e.Name(),
			Path:      filepath.Join(screenDir, e.Name()),
			CreatedAt: info.ModTime().UnixMilli(),
		})
	}
	return items, nil
}

// DeleteScreenshot removes a screenshot file from disk.
func DeleteScreenshot(id, fileName string) error {
	instDir, err := GetInstanceDir(id)
	if err != nil {
		return err
	}
	return os.Remove(filepath.Join(instDir, "minecraft", "screenshots", fileName))
}

// OpenFolder opens the instance directory or a subfolder in the platform file explorer.
func OpenFolder(id string, subfolder *string) error {
	instDir, err := GetInstanceDir(id)
	if err != nil {
		return err
	}

	target := instDir
	if subfolder != nil && *subfolder != "" {
		target = filepath.Join(instDir, "minecraft", *subfolder)
		_ = os.MkdirAll(target, 0755)
	}

	switch runtime.GOOS {
	case "linux":
		return exec.Command("xdg-open", target).Start()
	case "darwin":
		return exec.Command("open", target).Start()
	case "windows":
		return exec.Command("explorer", target).Start()
	default:
		return fmt.Errorf("unsupported platform")
	}
}
