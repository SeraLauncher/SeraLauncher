package export

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"serago/internal/instances"
)

// ExportOptions describes parameters for exporting an instance.
type ExportOptions struct {
	InstanceID           string `json:"instanceId"`
	Name                 string `json:"name"`
	Format               string `json:"format"` // "sera_zip" | "mrpack"
	IncludeMods          bool   `json:"includeMods"`
	IncludeConfigs       bool   `json:"includeConfigs"`
	IncludeResourcepacks bool   `json:"includeResourcepacks"`
	IncludeShaderpacks   bool   `json:"includeShaderpacks"`
	IncludeSaves         bool   `json:"includeSaves"`
}

// ExportResult contains the generated export archive details.
type ExportResult struct {
	OutputPath string `json:"outputPath"`
	FileName   string `json:"fileName"`
	SizeBytes  uint64 `json:"sizeBytes"`
}

// ExportInstance packages an instance into a zip or mrpack archive.
func ExportInstance(options ExportOptions) (ExportResult, error) {
	instDir, err := instances.GetInstanceDir(options.InstanceID)
	if err != nil {
		return ExportResult{}, err
	}

	home, _ := os.UserHomeDir()
	dlDir := filepath.Join(home, "Downloads")
	_ = os.MkdirAll(dlDir, 0755)

	ext := "zip"
	if strings.ToLower(options.Format) == "mrpack" {
		ext = "mrpack"
	}

	cleanName := strings.ReplaceAll(options.Name, " ", "-")
	fileName := fmt.Sprintf("%s.%s", cleanName, ext)
	outPath := filepath.Join(dlDir, fileName)

	f, err := os.Create(outPath)
	if err != nil {
		return ExportResult{}, err
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	defer zw.Close()

	mcDir := filepath.Join(instDir, "minecraft")
	addFolder := func(subfolder string) {
		src := filepath.Join(mcDir, subfolder)
		_ = filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(mcDir, p)
			if err != nil {
				return nil
			}
			w, err := zw.Create(filepath.Join("minecraft", rel))
			if err != nil {
				return nil
			}
			rf, err := os.Open(p)
			if err == nil {
				_, _ = io.Copy(w, rf)
				rf.Close()
			}
			return nil
		})
	}

	if options.IncludeMods {
		addFolder("mods")
	}
	if options.IncludeConfigs {
		addFolder("config")
	}
	if options.IncludeResourcepacks {
		addFolder("resourcepacks")
	}
	if options.IncludeShaderpacks {
		addFolder("shaderpacks")
	}
	if options.IncludeSaves {
		addFolder("saves")
	}

	// Add instance.json
	instJSON, _ := os.ReadFile(filepath.Join(instDir, "instance.json"))
	w, _ := zw.Create("instance.json")
	_, _ = w.Write(instJSON)

	fi, _ := f.Stat()
	var size uint64
	if fi != nil {
		size = uint64(fi.Size())
	}

	return ExportResult{
		OutputPath: outPath,
		FileName:   fileName,
		SizeBytes:  size,
	}, nil
}
