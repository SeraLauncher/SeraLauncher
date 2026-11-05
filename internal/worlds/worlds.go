package worlds

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"serago/internal/instances"
)

// WorldItem describes a singleplayer world save.
type WorldItem struct {
	FolderName   string `json:"folderName"`
	WorldName    string `json:"worldName"`
	LastPlayed   int64  `json:"lastPlayed"`
	GameType     string `json:"gameType"`
	SizeOnDiskMb uint64 `json:"sizeOnDiskMb"`
}

// WorldBackupItem describes a zipped world backup.
type WorldBackupItem struct {
	BackupFileName string `json:"backupFileName"`
	CreatedAt      int64  `json:"createdAt"`
	SizeBytes      uint64 `json:"sizeBytes"`
}

// ListWorlds scans `<instance>/minecraft/saves` for saved worlds.
func ListWorlds(instanceID string) ([]WorldItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	savesDir := filepath.Join(instDir, "minecraft", "saves")
	entries, err := os.ReadDir(savesDir)
	if err != nil {
		return []WorldItem{}, nil
	}

	var worlds []WorldItem
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		folderPath := filepath.Join(savesDir, name)

		info, err := e.Info()
		lastPlayed := time.Now().UnixMilli()
		if err == nil {
			lastPlayed = info.ModTime().UnixMilli()
		}

		worlds = append(worlds, WorldItem{
			FolderName:   name,
			WorldName:    name,
			LastPlayed:   lastPlayed,
			GameType:     "Survival",
			SizeOnDiskMb: calculateDirSizeMB(folderPath),
		})
	}
	return worlds, nil
}

func calculateDirSizeMB(path string) uint64 {
	var total int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return uint64(total / (1024 * 1024))
}

// CreateBackup compresses a world save into `<instance>/backups/<folderName>-<timestamp>.zip`.
func CreateBackup(instanceID, folderName string) (WorldBackupItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return WorldBackupItem{}, err
	}

	backupsDir := filepath.Join(instDir, "minecraft", "backups")
	_ = os.MkdirAll(backupsDir, 0755)

	saveDir := filepath.Join(instDir, "minecraft", "saves", folderName)
	if _, err := os.Stat(saveDir); err != nil {
		return WorldBackupItem{}, fmt.Errorf("world save not found: %s", folderName)
	}

	now := time.Now()
	backupFileName := fmt.Sprintf("%s-%d.zip", folderName, now.Unix())
	zipPath := filepath.Join(backupsDir, backupFileName)

	f, err := os.Create(zipPath)
	if err != nil {
		return WorldBackupItem{}, err
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	defer zw.Close()

	err = filepath.Walk(saveDir, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(saveDir, p)
		if err != nil || rel == "." {
			return nil
		}
		if info.IsDir() {
			_, err = zw.Create(rel + "/")
			return err
		}
		w, err := zw.Create(rel)
		if err != nil {
			return err
		}
		rf, err := os.Open(p)
		if err != nil {
			return err
		}
		_, err = io.Copy(w, rf)
		rf.Close()
		return err
	})
	if err != nil {
		return WorldBackupItem{}, err
	}

	fi, _ := f.Stat()
	var size uint64
	if fi != nil {
		size = uint64(fi.Size())
	}

	return WorldBackupItem{
		BackupFileName: backupFileName,
		CreatedAt:      now.UnixMilli(),
		SizeBytes:      size,
	}, nil
}

// ListBackups returns all created zip backups in `<instance>/minecraft/backups`.
func ListBackups(instanceID string) ([]WorldBackupItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	backupsDir := filepath.Join(instDir, "minecraft", "backups")
	entries, err := os.ReadDir(backupsDir)
	if err != nil {
		return []WorldBackupItem{}, nil
	}

	var items []WorldBackupItem
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".zip") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		items = append(items, WorldBackupItem{
			BackupFileName: e.Name(),
			CreatedAt:      info.ModTime().UnixMilli(),
			SizeBytes:      uint64(info.Size()),
		})
	}
	return items, nil
}

// DeleteBackup removes a backup file.
func DeleteBackup(instanceID, backupFileName string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}
	return os.Remove(filepath.Join(instDir, "minecraft", "backups", backupFileName))
}

// RestoreBackup unpacks a backup zip archive back into <instance>/minecraft/saves/.
func RestoreBackup(instanceID, backupFileName string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}

	backupPath := filepath.Join(instDir, "minecraft", "backups", backupFileName)
	zr, err := zip.OpenReader(backupPath)
	if err != nil {
		return fmt.Errorf("failed to open backup archive: %w", err)
	}
	defer zr.Close()

	savesDir := filepath.Join(instDir, "minecraft", "saves")
	_ = os.MkdirAll(savesDir, 0755)

	for _, f := range zr.File {
		target := filepath.Join(savesDir, f.Name)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(target, 0755)
			continue
		}
		_ = os.MkdirAll(filepath.Dir(target), 0755)
		rc, err := f.Open()
		if err != nil {
			continue
		}
		out, err := os.Create(target)
		if err == nil {
			_, _ = io.Copy(out, rc)
			out.Close()
		}
		rc.Close()
	}
	return nil
}

// DeleteSave removes a world folder permanently.
func DeleteSave(instanceID, folderName string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(instDir, "minecraft", "saves", folderName))
}

// CloneSave duplicates a world save directory with a copy suffix.
func CloneSave(instanceID, folderName string) (WorldItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return WorldItem{}, err
	}

	savesDir := filepath.Join(instDir, "minecraft", "saves")
	src := filepath.Join(savesDir, folderName)
	dstName := fmt.Sprintf("%s-copy", folderName)
	dst := filepath.Join(savesDir, dstName)

	_ = os.MkdirAll(dst, 0755)
	_ = filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			_ = os.MkdirAll(target, 0755)
		} else {
			data, err := os.ReadFile(p)
			if err == nil {
				_ = os.WriteFile(target, data, 0644)
			}
		}
		return nil
	})

	return WorldItem{
		FolderName:   dstName,
		WorldName:    dstName,
		LastPlayed:   time.Now().UnixMilli(),
		GameType:     "Survival",
		SizeOnDiskMb: calculateDirSizeMB(dst),
	}, nil
}

// ImportWorldZip extracts an external world zip archive into the instance saves directory.
func ImportWorldZip(instanceID, zipPath string) (WorldItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return WorldItem{}, err
	}

	savesDir := filepath.Join(instDir, "minecraft", "saves")
	_ = os.MkdirAll(savesDir, 0755)

	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return WorldItem{}, err
	}
	defer zr.Close()

	worldName := strings.TrimSuffix(filepath.Base(zipPath), filepath.Ext(zipPath))
	targetDir := filepath.Join(savesDir, worldName)
	_ = os.MkdirAll(targetDir, 0755)

	for _, f := range zr.File {
		path := filepath.Join(targetDir, f.Name)
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(path, 0755)
			continue
		}
		_ = os.MkdirAll(filepath.Dir(path), 0755)
		rc, err := f.Open()
		if err != nil {
			continue
		}
		out, err := os.Create(path)
		if err == nil {
			_, _ = io.Copy(out, rc)
			out.Close()
		}
		rc.Close()
	}

	return WorldItem{
		FolderName:   worldName,
		WorldName:    worldName,
		LastPlayed:   time.Now().UnixMilli(),
		GameType:     "Survival",
		SizeOnDiskMb: calculateDirSizeMB(targetDir),
	}, nil
}
