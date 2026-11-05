package ingest

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"

	"serago/internal/instances"
)

// IngestedItem describes a file dragged into the instance.
type IngestedItem struct {
	FileName    string  `json:"fileName"`
	DisplayName string  `json:"displayName"`
	Category    string  `json:"category"` // "mods" | "resourcepack" | "shader" | "world"
	TargetPath  string  `json:"targetPath"`
	Success     bool    `json:"success"`
	Error       *string `json:"error,omitempty"`
}

// IngestDroppedFiles classifies and copies dropped files into their appropriate folder.
func IngestDroppedFiles(instanceID string, paths []string) ([]IngestedItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	mcDir := filepath.Join(instDir, "minecraft")
	modsDir := filepath.Join(mcDir, "mods")
	rpDir := filepath.Join(mcDir, "resourcepacks")
	spDir := filepath.Join(mcDir, "shaderpacks")

	_ = os.MkdirAll(modsDir, 0755)
	_ = os.MkdirAll(rpDir, 0755)
	_ = os.MkdirAll(spDir, 0755)

	var results []IngestedItem

	for _, src := range paths {
		info, err := os.Stat(src)
		if err != nil || info.IsDir() {
			continue
		}

		fname := filepath.Base(src)
		ext := strings.ToLower(filepath.Ext(src))

		var dest string
		var cat string

		switch ext {
		case ".jar":
			cat = "mods"
			dest = filepath.Join(modsDir, fname)
		case ".zip":
			// Inspect contents
			cat = "resourcepack"
			if zr, err := zip.OpenReader(src); err == nil {
				for _, f := range zr.File {
					if strings.HasPrefix(f.Name, "shaders/") {
						cat = "shader"
						break
					}
				}
				zr.Close()
			}
			if cat == "shader" {
				dest = filepath.Join(spDir, fname)
			} else {
				dest = filepath.Join(rpDir, fname)
			}
		default:
			cat = "unknown"
		}

		if dest != "" {
			err := copyFile(src, dest)
			results = append(results, IngestedItem{
				FileName:    fname,
				DisplayName: fname,
				Category:    cat,
				TargetPath:  dest,
				Success:     err == nil,
			})
		}
	}

	return results, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
