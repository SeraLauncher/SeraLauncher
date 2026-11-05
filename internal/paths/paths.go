package paths

import (
	"os"
	"path/filepath"
	"runtime"
)

// AppDataRoot returns the platform-specific data directory for SeraLauncher:
// - Linux: ~/.local/share/SeraLauncher (or $XDG_DATA_HOME/SeraLauncher)
// - macOS: ~/Library/Application Support/SeraLauncher
// - Windows: %APPDATA%\SeraLauncher
func AppDataRoot() (string, error) {
	var base string

	switch runtime.GOOS {
	case "windows":
		base = os.Getenv("APPDATA")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, "AppData", "Roaming")
		}
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, "Library", "Application Support")
	default:
		// linux and unix
		base = os.Getenv("XDG_DATA_HOME")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, ".local", "share")
		}
	}

	root := filepath.Join(base, "SeraLauncher")
	if err := os.MkdirAll(root, 0755); err != nil {
		return "", err
	}
	return root, nil
}

// MigrateLegacyDataDir moves webview data from lowercase seralauncher to SeraLauncher
func MigrateLegacyDataDir() {
	if runtime.GOOS != "linux" {
		return
	}
	base := os.Getenv("XDG_DATA_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return
		}
		base = filepath.Join(home, ".local", "share")
	}

	legacyDir := filepath.Join(base, "seralauncher")
	targetDir := filepath.Join(base, "SeraLauncher")

	entries, err := os.ReadDir(legacyDir)
	if err != nil {
		return
	}

	_ = os.MkdirAll(targetDir, 0755)
	for _, entry := range entries {
		oldPath := filepath.Join(legacyDir, entry.Name())
		newPath := filepath.Join(targetDir, entry.Name())
		if _, err := os.Stat(newPath); os.IsNotExist(err) {
			_ = os.Rename(oldPath, newPath)
		}
	}

	// Remove remaining empty legacy dir if all entries were moved
	_ = os.RemoveAll(legacyDir)
}

func ensureDir(parent string, name string) (string, error) {
	dir := filepath.Join(parent, name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

// InstancesDir returns the directory where instance folders reside.
func InstancesDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "instance")
}

// RuntimesDir returns the directory for managed Java installations.
func RuntimesDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "runtimes")
}

// AssetsDir returns the shared Minecraft assets directory.
func AssetsDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "assets")
}

// LibrariesDir returns the shared Minecraft libraries directory.
func LibrariesDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "libraries")
}

// VersionsDir returns the shared Minecraft versions directory.
func VersionsDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "versions")
}

// SkinsDir returns the cached player skins directory.
func SkinsDir() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return ensureDir(root, "skins")
}

// SettingsFilePath returns the full path to settings.json.
func SettingsFilePath() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "settings.json"), nil
}

// AccountsFilePath returns the full path to accounts.json.
func AccountsFilePath() (string, error) {
	root, err := AppDataRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "accounts.json"), nil
}
