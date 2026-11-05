package modpack

import (
	"archive/zip"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"serago/internal/instances"
)

// ModpackInspection describes an inspected modpack archive.
type ModpackInspection struct {
	Name          string  `json:"name"`
	Summary       *string `json:"summary"`
	McVersion     string  `json:"mcVersion"`
	Loader        *string `json:"loader"`
	LoaderVersion *string `json:"loaderVersion"`
	FileCount     int     `json:"fileCount"`
	Format        string  `json:"format"`
}

// InspectModpackFile inspects a .mrpack or .zip modpack archive.
func InspectModpackFile(filePath string) (ModpackInspection, error) {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return ModpackInspection{}, err
	}
	defer zr.Close()

	// 1. Modrinth mrpack
	for _, f := range zr.File {
		if f.Name == "modrinth.index.json" {
			rc, err := f.Open()
			if err != nil {
				return ModpackInspection{}, err
			}
			defer rc.Close()

			type mrpackIndex struct {
				Name         string            `json:"name"`
				Summary      *string           `json:"summary"`
				Dependencies map[string]string `json:"dependencies"`
				Files        []any             `json:"files"`
			}
			var idx mrpackIndex
			if err := json.NewDecoder(rc).Decode(&idx); err != nil {
				return ModpackInspection{}, err
			}

			mcVer := idx.Dependencies["minecraft"]
			var loader *string
			var loaderVer *string
			for k, v := range idx.Dependencies {
				if k != "minecraft" {
					l := k
					ver := v
					loader = &l
					loaderVer = &ver
					break
				}
			}

			return ModpackInspection{
				Name:          idx.Name,
				Summary:       idx.Summary,
				McVersion:     mcVer,
				Loader:        loader,
				LoaderVersion: loaderVer,
				FileCount:     len(idx.Files),
				Format:        "mrpack",
			}, nil
		}
	}

	// 2. CurseForge zip
	for _, f := range zr.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return ModpackInspection{}, err
			}
			defer rc.Close()

			type cfManifest struct {
				Name      string `json:"name"`
				Minecraft struct {
					Version    string `json:"version"`
					ModLoaders []struct {
						ID string `json:"id"`
					} `json:"modLoaders"`
				} `json:"minecraft"`
				Files []any `json:"files"`
			}
			var mf cfManifest
			if err := json.NewDecoder(rc).Decode(&mf); err != nil {
				return ModpackInspection{}, err
			}

			var loader *string
			if len(mf.Minecraft.ModLoaders) > 0 {
				l := mf.Minecraft.ModLoaders[0].ID
				loader = &l
			}

			return ModpackInspection{
				Name:      mf.Name,
				McVersion: mf.Minecraft.Version,
				Loader:    loader,
				FileCount: len(mf.Files),
				Format:    "curseforge",
			}, nil
		}
	}

	baseName := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	return ModpackInspection{
		Name:      baseName,
		McVersion: "1.20.1",
		FileCount: len(zr.File),
		Format:    "unknown",
	}, nil
}

// InstallModpackFromFile creates an instance and extracts a local modpack archive.
func InstallModpackFromFile(filePath string, customName, customIcon *string) (instances.Instance, error) {
	meta, err := InspectModpackFile(filePath)
	if err != nil {
		return instances.Instance{}, err
	}

	name := meta.Name
	if customName != nil && *customName != "" {
		name = *customName
	}

	inst, err := instances.CreateInstance(name, meta.McVersion, nil, customIcon, meta.Loader, meta.LoaderVersion)
	if err != nil {
		return instances.Instance{}, err
	}

	instDir, err := instances.GetInstanceDir(inst.ID)
	if err != nil {
		return inst, err
	}

	// Extract overrides/ to <instance>/minecraft/
	zr, err := zip.OpenReader(filePath)
	if err == nil {
		defer zr.Close()
		gameDir := filepath.Join(instDir, "minecraft")
		for _, f := range zr.File {
			if strings.HasPrefix(f.Name, "overrides/") {
				rel := strings.TrimPrefix(f.Name, "overrides/")
				if rel == "" {
					continue
				}
				destPath := filepath.Join(gameDir, rel)
				if f.FileInfo().IsDir() {
					_ = os.MkdirAll(destPath, 0755)
					continue
				}
				_ = os.MkdirAll(filepath.Dir(destPath), 0755)
				rc, err := f.Open()
				if err == nil {
					df, err := os.Create(destPath)
					if err == nil {
						_, _ = io.Copy(df, rc)
						df.Close()
					}
					rc.Close()
				}
			}
		}
	}

	return inst, nil
}

// InstallModpackFromURL downloads a remote modpack archive and installs it.
func InstallModpackFromURL(downloadURL string, customName, customIcon *string) (instances.Instance, error) {
	tmp, err := os.CreateTemp("", "modpack-*.mrpack")
	if err != nil {
		return instances.Instance{}, err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return instances.Instance{}, err
	}
	defer resp.Body.Close()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		return instances.Instance{}, err
	}

	return InstallModpackFromFile(tmp.Name(), customName, customIcon)
}

// PickModpackFile opens the platform file dialog to pick an archive.
func PickModpackFile() (*string, error) {
	// Try zenity on Linux
	if out, err := exec.Command("zenity", "--file-selection", "--title=Select Modpack Archive", "--file-filter=Minecraft Archives (*.mrpack, *.zip) | *.mrpack *.zip").Output(); err == nil {
		p := strings.TrimSpace(string(out))
		if p != "" {
			return &p, nil
		}
	}

	// Try kdialog on KDE
	if out, err := exec.Command("kdialog", "--getopenfilename", "~", "*.mrpack *.zip").Output(); err == nil {
		p := strings.TrimSpace(string(out))
		if p != "" {
			return &p, nil
		}
	}

	return nil, nil
}
