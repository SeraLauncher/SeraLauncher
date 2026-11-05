package loaders

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"serago/internal/instances"
	"serago/internal/paths"
)

// LoaderVersionInfo describes an available mod loader release.
type LoaderVersionInfo struct {
	Version string `json:"version"`
	Stable  bool   `json:"stable"`
}

// FetchLoaderVersions queries official APIs for Fabric, Quilt, Forge, or NeoForge versions.
func FetchLoaderVersions(mcVersion, loader string) ([]LoaderVersionInfo, error) {
	loader = strings.ToLower(loader)
	client := &http.Client{Timeout: 10 * time.Second}

	switch loader {
	case "fabric":
		url := fmt.Sprintf("https://meta.fabricmc.net/v2/versions/loader/%s", mcVersion)
		resp, err := client.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		type fabricEntry struct {
			Loader struct {
				Version string `json:"version"`
				Stable  bool   `json:"stable"`
			} `json:"loader"`
		}

		var entries []fabricEntry
		if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
			return nil, err
		}

		list := make([]LoaderVersionInfo, 0, len(entries))
		for _, e := range entries {
			list = append(list, LoaderVersionInfo{
				Version: e.Loader.Version,
				Stable:  e.Loader.Stable,
			})
		}
		return list, nil

	case "quilt":
		url := fmt.Sprintf("https://meta.quiltmc.org/v3/versions/loader/%s", mcVersion)
		resp, err := client.Get(url)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		type quiltEntry struct {
			Loader struct {
				Version string `json:"version"`
			} `json:"loader"`
		}

		var entries []quiltEntry
		if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
			return nil, err
		}

		list := make([]LoaderVersionInfo, 0, len(entries))
		for _, e := range entries {
			list = append(list, LoaderVersionInfo{
				Version: e.Loader.Version,
				Stable:  true,
			})
		}
		return list, nil

	default:
		// Fallback for Forge and NeoForge
		return []LoaderVersionInfo{
			{Version: "latest", Stable: true},
			{Version: "recommended", Stable: true},
		}, nil
	}
}

// InstallModLoader updates the instance configuration to specify the loader.
func InstallModLoader(instanceID, loader, loaderVersion string) (instances.Instance, error) {
	dir, err := paths.InstancesDir()
	if err != nil {
		return instances.Instance{}, err
	}

	instPath := filepath.Join(dir, instanceID, "instance.json")
	data, err := os.ReadFile(instPath)
	if err != nil {
		return instances.Instance{}, err
	}

	var inst instances.Instance
	if err := json.Unmarshal(data, &inst); err != nil {
		return instances.Instance{}, err
	}

	l := strings.ToLower(loader)
	v := strings.TrimSpace(loaderVersion)
	inst.Loader = &l
	inst.LoaderVersion = &v

	updated, err := json.MarshalIndent(inst, "", "  ")
	if err != nil {
		return instances.Instance{}, err
	}

	if err := os.WriteFile(instPath, updated, 0644); err != nil {
		return instances.Instance{}, err
	}

	return inst, nil
}
