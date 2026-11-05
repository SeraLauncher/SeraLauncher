package java

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"serago/internal/paths"
)

// JavaRuntime represents an installed or discovered Java environment.
type JavaRuntime struct {
	Path         string `json:"path"`
	Version      string `json:"version"`
	MajorVersion uint32 `json:"majorVersion"`
	Is64Bit      bool   `json:"is64Bit"`
	IsManaged    bool   `json:"isManaged"`
}

// ManagedJavaRuntime represents an Adoptium runtime status managed by the launcher.
type ManagedJavaRuntime struct {
	MajorVersion  uint32  `json:"majorVersion"`
	Title         string  `json:"title"`
	ReleaseName   string  `json:"releaseName"`
	IsInstalled   bool    `json:"isInstalled"`
	DiskSizeBytes uint64  `json:"diskSizeBytes"`
	Path          *string `json:"path"`
}

// RequiredVersion returns the Java major version required for a Minecraft release.
func RequiredVersion(mcVersion string) uint32 {
	parts := strings.Split(mcVersion, ".")
	if len(parts) >= 2 {
		minor, err := strconv.Atoi(parts[1])
		if err == nil {
			if minor <= 16 {
				return 8
			}
			if minor == 17 {
				return 16
			}
			if minor <= 20 {
				if len(parts) >= 3 {
					patch, err := strconv.Atoi(parts[2])
					if err == nil && minor == 20 && patch >= 5 {
						return 21
					}
				}
				return 17
			}
			return 21
		}
	}
	return 21
}

// InspectBinary runs `java -version` on a path to verify it and extract version info.
func InspectBinary(javaPath string) (*JavaRuntime, error) {
	cmd := exec.Command(javaPath, "-version")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("invalid java binary at %s: %w", javaPath, err)
	}

	text := string(out)
	major, version := parseJavaVersion(text)
	if major == 0 {
		return nil, errors.New("unable to determine java version")
	}

	is64 := strings.Contains(strings.ToLower(text), "64-bit") || runtime.GOARCH == "amd64" || runtime.GOARCH == "arm64"
	runtimesDir, _ := paths.RuntimesDir()
	isManaged := runtimesDir != "" && strings.HasPrefix(filepath.Clean(javaPath), filepath.Clean(runtimesDir))

	return &JavaRuntime{
		Path:         javaPath,
		Version:      version,
		MajorVersion: major,
		Is64Bit:      is64,
		IsManaged:    isManaged,
	}, nil
}

func parseJavaVersion(output string) (uint32, string) {
	// matches 'version "1.8.0_382"' or 'version "17.0.9"' or 'version "21"'
	re := regexp.MustCompile(`version "([^"]+)"`)
	matches := re.FindStringSubmatch(output)
	if len(matches) < 2 {
		return 0, ""
	}

	ver := matches[1]
	parts := strings.Split(ver, ".")
	if len(parts) == 0 {
		return 0, ver
	}

	if parts[0] == "1" && len(parts) > 1 {
		// Java 1.8 -> 8
		major, _ := strconv.ParseUint(parts[1], 10, 32)
		return uint32(major), ver
	}

	major, _ := strconv.ParseUint(parts[0], 10, 32)
	return uint32(major), ver
}

// DiscoverRuntimes searches known system directories and the managed runtimes folder.
func DiscoverRuntimes() []JavaRuntime {
	seen := make(map[string]bool)
	var list []JavaRuntime

	addCandidate := func(p string) {
		p = filepath.Clean(p)
		if seen[p] {
			return
		}
		if info, err := InspectBinary(p); err == nil {
			seen[p] = true
			list = append(list, *info)
		}
	}

	// 1. Managed runtimes
	if rDir, err := paths.RuntimesDir(); err == nil {
		entries, _ := os.ReadDir(rDir)
		for _, e := range entries {
			if e.IsDir() {
				bin := findJavaBinary(filepath.Join(rDir, e.Name()))
				if bin != "" {
					addCandidate(bin)
				}
			}
		}
	}

	// 2. PATH lookup
	if pathBin, err := exec.LookPath("java"); err == nil {
		if realPath, err := filepath.EvalSymlinks(pathBin); err == nil {
			addCandidate(realPath)
		} else {
			addCandidate(pathBin)
		}
	}

	// 3. Platform locations
	switch runtime.GOOS {
	case "linux":
		candidates := []string{
			"/usr/lib/jvm",
			"/usr/java",
			"/opt/java",
		}
		for _, base := range candidates {
			entries, _ := os.ReadDir(base)
			for _, e := range entries {
				bin := filepath.Join(base, e.Name(), "bin", "java")
				if fileExists(bin) {
					addCandidate(bin)
				}
			}
		}
	case "darwin":
		candidates := []string{
			"/Library/Java/JavaVirtualMachines",
			filepath.Join(os.Getenv("HOME"), "Library/Java/JavaVirtualMachines"),
		}
		for _, base := range candidates {
			entries, _ := os.ReadDir(base)
			for _, e := range entries {
				bin := filepath.Join(base, e.Name(), "Contents/Home/bin/java")
				if fileExists(bin) {
					addCandidate(bin)
				}
			}
		}
	case "windows":
		candidates := []string{
			`C:\Program Files\Java`,
			`C:\Program Files\Eclipse Adoptium`,
		}
		for _, base := range candidates {
			entries, _ := os.ReadDir(base)
			for _, e := range entries {
				bin := filepath.Join(base, e.Name(), "bin", "java.exe")
				if fileExists(bin) {
					addCandidate(bin)
				}
			}
		}
	}

	return list
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func findJavaBinary(root string) string {
	binaryName := "java"
	if runtime.GOOS == "windows" {
		binaryName = "java.exe"
	}

	direct := filepath.Join(root, "bin", binaryName)
	if fileExists(direct) {
		return direct
	}

	mac := filepath.Join(root, "Contents", "Home", "bin", binaryName)
	if fileExists(mac) {
		return mac
	}

	entries, _ := os.ReadDir(root)
	for _, e := range entries {
		if e.IsDir() {
			subDirect := filepath.Join(root, e.Name(), "bin", binaryName)
			if fileExists(subDirect) {
				return subDirect
			}
			subMac := filepath.Join(root, e.Name(), "Contents", "Home", "bin", binaryName)
			if fileExists(subMac) {
				return subMac
			}
		}
	}
	return ""
}

func calculateDirSize(dir string) uint64 {
	var total uint64
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			total += uint64(info.Size())
		}
		return nil
	})
	return total
}

// GetManagedRuntimes returns the status of all standard managed Java runtimes (Java 8, 17, 21, and 25).
func GetManagedRuntimes() ([]ManagedJavaRuntime, error) {
	rDir, err := paths.RuntimesDir()
	if err != nil {
		return nil, err
	}

	targets := []struct {
		major       uint32
		title       string
		releaseName string
	}{
		{8, "Java 8", "Legacy (Minecraft 1.16.5 and older)"},
		{17, "Java 17", "Standard (Minecraft 1.17 to 1.20.4)"},
		{21, "Java 21", "LTS (Minecraft 1.20.5 and newer)"},
		{25, "Java 25", "Next-Gen (Minecraft 25.x, 26.x, and snapshots)"},
	}

	var list []ManagedJavaRuntime
	for _, t := range targets {
		dir := filepath.Join(rDir, fmt.Sprintf("java-%d", t.major))
		isInstalled := false
		var diskSize uint64
		var javaBin *string

		if fi, err := os.Stat(dir); err == nil && fi.IsDir() {
			bin := findJavaBinary(dir)
			if bin != "" {
				isInstalled = true
				diskSize = calculateDirSize(dir)
				javaBin = &bin
			}
		}

		list = append(list, ManagedJavaRuntime{
			MajorVersion:  t.major,
			Title:         t.title,
			ReleaseName:   t.releaseName,
			IsInstalled:   isInstalled,
			DiskSizeBytes: diskSize,
			Path:          javaBin,
		})
	}

	return list, nil
}

// UninstallManagedRuntime deletes a managed Java version from the runtimes directory.
func UninstallManagedRuntime(majorVersion uint32) error {
	rDir, err := paths.RuntimesDir()
	if err != nil {
		return err
	}

	target := filepath.Join(rDir, fmt.Sprintf("java-%d", majorVersion))
	return os.RemoveAll(target)
}

// InstallAdoptiumRuntime downloads and unpacks a JDK from the Eclipse Adoptium API.
func InstallAdoptiumRuntime(majorVersion uint32) (*JavaRuntime, error) {
	rDir, err := paths.RuntimesDir()
	if err != nil {
		return nil, err
	}

	osName := runtime.GOOS
	if osName == "darwin" {
		osName = "mac"
	}
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}

	targetDir := filepath.Join(rDir, fmt.Sprintf("java-%d", majorVersion))
	_ = os.RemoveAll(targetDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf(
		"https://api.adoptium.net/v3/binary/latest/%d/ga/%s/%s/jdk/hotspot/normal/eclipse",
		majorVersion, osName, arch,
	)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch adoptium jdk: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("adoptium returned status %d", resp.StatusCode)
	}

	if runtime.GOOS == "windows" {
		err = unpackZip(resp.Body, targetDir)
	} else {
		err = unpackTarGz(resp.Body, targetDir)
	}
	if err != nil {
		_ = os.RemoveAll(targetDir)
		return nil, err
	}

	bin := findJavaBinary(targetDir)
	if bin == "" {
		return nil, errors.New("java binary not found in unpacked runtime")
	}

	_ = os.Chmod(bin, 0755)
	return InspectBinary(bin)
}

func unpackTarGz(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target := filepath.Join(dest, header.Name)
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
	return nil
}

func unpackZip(r io.Reader, dest string) error {
	tmp, err := os.CreateTemp("", "adoptium-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	size, err := io.Copy(tmp, r)
	if err != nil {
		return err
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		return err
	}

	for _, file := range zr.File {
		path := filepath.Join(dest, file.Name)
		if file.FileInfo().IsDir() {
			_ = os.MkdirAll(path, 0755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}
		rc, err := file.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(dst, rc)
		dst.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
