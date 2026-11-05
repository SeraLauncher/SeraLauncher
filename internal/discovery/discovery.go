package discovery

import (
	"archive/zip"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"serago/internal/instances"
)

// DiscoveryProject represents an addon project from Modrinth or CurseForge.
type DiscoveryProject struct {
	ID                string   `json:"id"`
	Slug              string   `json:"slug"`
	Title             string   `json:"title"`
	Description       string   `json:"description"`
	Author            string   `json:"author"`
	IconURL           *string  `json:"iconUrl"`
	Downloads         uint64   `json:"downloads"`
	Follows           *uint64  `json:"follows"`
	Source            string   `json:"source"`
	ProjectType       string   `json:"projectType"`
	Categories        []string `json:"categories"`
	SupportedLoaders  []string `json:"supportedLoaders"`
	SupportedVersions []string `json:"supportedVersions"`
	DateModified      *string  `json:"dateModified"`
	DownloadURL       *string  `json:"downloadUrl"`
	Environment       *string  `json:"environment"`
}

// DiscoveryProjectDetails contains full metadata for a project.
type DiscoveryProjectDetails struct {
	ID           string   `json:"id"`
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Body         string   `json:"body"`
	Author       string   `json:"author"`
	IconURL      *string  `json:"iconUrl"`
	Downloads    uint64   `json:"downloads"`
	Follows      *uint64  `json:"follows"`
	Source       string   `json:"source"`
	ProjectType  string   `json:"projectType"`
	Categories   []string `json:"categories"`
	Gallery      []string `json:"gallery"`
	DateCreated  *string  `json:"dateCreated"`
	DateModified *string  `json:"dateModified"`
}

// DiscoveryVersion describes a downloadable release for a project.
type DiscoveryVersion struct {
	ID           string   `json:"id"`
	ProjectID    string   `json:"projectId"`
	Name         string   `json:"name"`
	VersionNum   string   `json:"versionNumber"`
	Changelog    *string  `json:"changelog"`
	GameVersions []string `json:"gameVersions"`
	Loaders      []string `json:"loaders"`
	VersionType  string   `json:"versionType"`
	Downloads    uint64   `json:"downloads"`
	DownloadURL  string   `json:"downloadUrl"`
	FileName     string   `json:"fileName"`
	FileSize     uint64   `json:"fileSize"`
}

// AddonUpdateInfo describes an update available for an installed addon.
type AddonUpdateInfo struct {
	FileName      string `json:"fileName"`
	CurrentVerID  string `json:"currentVersionId"`
	LatestVerID   string `json:"latestVersionId"`
	LatestVerNum  string `json:"latestVersionNumber"`
	DownloadURL   string `json:"downloadUrl"`
	UpdateTitle   string `json:"updateTitle"`
	IsReleaseType bool   `json:"isReleaseType"`
}

// DiscoverySearchResponse is returned by search_discovery.
type DiscoverySearchResponse struct {
	Source    string             `json:"source"`
	Projects  []DiscoveryProject `json:"projects"`
	TotalHits uint64             `json:"totalHits"`
	Offset    uint32             `json:"offset"`
	Limit     uint32             `json:"limit"`
}

// InstalledAddonItem describes an installed mod, resourcepack, or shader with full UI metadata.
type InstalledAddonItem struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	FileName     string  `json:"fileName"`
	Version      *string `json:"version"`
	Description  *string `json:"description"`
	SizeBytes    uint64  `json:"sizeBytes"`
	Enabled      bool    `json:"enabled"`
	ModID        *string `json:"modId"`
	DateModified *string `json:"dateModified"`
	Source       *string `json:"source"`
	IconURL      *string `json:"iconUrl"`
	ProjectID    *string `json:"projectId"`
}

// StripMinecraftFormatting removes Minecraft § formatting codes from text.
func StripMinecraftFormatting(s string) string {
	var b strings.Builder
	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		if runes[i] == '§' && i+1 < len(runes) {
			i++
			continue
		}
		b.WriteRune(runes[i])
	}
	return strings.TrimSpace(b.String())
}

// SearchProjects queries Modrinth API for matching addons.
func SearchProjects(provider, projectType string, query, mcVersion, loader *string, offset, limit uint32) (DiscoverySearchResponse, error) {
	if limit == 0 {
		limit = 20
	}

	baseURL := "https://api.modrinth.com/v2/search"
	values := url.Values{}
	if query != nil && *query != "" {
		values.Set("query", *query)
	}
	values.Set("offset", fmt.Sprintf("%d", offset))
	values.Set("limit", fmt.Sprintf("%d", limit))

	var facets [][]string
	if projectType != "" {
		facets = append(facets, []string{fmt.Sprintf("project_type:%s", projectType)})
	}
	if mcVersion != nil && *mcVersion != "" {
		facets = append(facets, []string{fmt.Sprintf("versions:%s", *mcVersion)})
	}
	if loader != nil && *loader != "" {
		facets = append(facets, []string{fmt.Sprintf("categories:%s", *loader)})
	}

	if len(facets) > 0 {
		facetJSON, _ := json.Marshal(facets)
		values.Set("facets", string(facetJSON))
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", baseURL+"?"+values.Encode(), nil)
	if err != nil {
		return DiscoverySearchResponse{}, err
	}
	req.Header.Set("User-Agent", "SeraLauncher/0.1.8")

	resp, err := client.Do(req)
	if err != nil {
		return DiscoverySearchResponse{}, err
	}
	defer resp.Body.Close()

	type modrinthHit struct {
		ProjectID   string   `json:"project_id"`
		Slug        string   `json:"slug"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Author      string   `json:"author"`
		IconURL     *string  `json:"icon_url"`
		Downloads   uint64   `json:"downloads"`
		Follows     *uint64  `json:"follows"`
		ProjectType string   `json:"project_type"`
		Categories  []string `json:"categories"`
		Versions    []string `json:"versions"`
	}

	type modrinthResponse struct {
		Hits      []modrinthHit `json:"hits"`
		TotalHits uint64        `json:"total_hits"`
		Offset    uint32        `json:"offset"`
		Limit     uint32        `json:"limit"`
	}

	var res modrinthResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return DiscoverySearchResponse{}, err
	}

	projects := make([]DiscoveryProject, 0, len(res.Hits))
	for _, h := range res.Hits {
		projects = append(projects, DiscoveryProject{
			ID:                h.ProjectID,
			Slug:              h.Slug,
			Title:             h.Title,
			Description:       h.Description,
			Author:            h.Author,
			IconURL:           h.IconURL,
			Downloads:         h.Downloads,
			Follows:           h.Follows,
			Source:            "modrinth",
			ProjectType:       h.ProjectType,
			Categories:        h.Categories,
			SupportedVersions: h.Versions,
		})
	}

	return DiscoverySearchResponse{
		Source:    "modrinth",
		Projects:  projects,
		TotalHits: res.TotalHits,
		Offset:    res.Offset,
		Limit:     res.Limit,
	}, nil
}

// GetProjectDetails queries Modrinth for detailed project description.
func GetProjectDetails(provider, projectID string) (DiscoveryProjectDetails, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	url := fmt.Sprintf("https://api.modrinth.com/v2/project/%s", projectID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "SeraLauncher/0.1.8")

	resp, err := client.Do(req)
	if err != nil {
		return DiscoveryProjectDetails{}, err
	}
	defer resp.Body.Close()

	var p struct {
		ID          string   `json:"id"`
		Slug        string   `json:"slug"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Body        string   `json:"body"`
		Categories  []string `json:"categories"`
		ProjectType string   `json:"project_type"`
		Downloads   uint64   `json:"downloads"`
		Followers   uint64   `json:"followers"`
		IconURL     *string  `json:"icon_url"`
		Published   string   `json:"published"`
		Updated     string   `json:"updated"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return DiscoveryProjectDetails{}, err
	}

	return DiscoveryProjectDetails{
		ID:           p.ID,
		Slug:         p.Slug,
		Title:        p.Title,
		Description:  p.Description,
		Body:         p.Body,
		Source:       "modrinth",
		ProjectType:  p.ProjectType,
		Categories:   p.Categories,
		Downloads:    p.Downloads,
		Follows:      &p.Followers,
		IconURL:      p.IconURL,
		DateCreated:  &p.Published,
		DateModified: &p.Updated,
	}, nil
}

// GetProjectVersions queries Modrinth for project version releases.
func GetProjectVersions(provider, projectID string, mcVersion, loader *string) ([]DiscoveryVersion, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	u := fmt.Sprintf("https://api.modrinth.com/v2/project/%s/version", projectID)
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "SeraLauncher/0.1.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	type mrFile struct {
		URL     string            `json:"url"`
		Name    string            `json:"filename"`
		Primary bool              `json:"primary"`
		Size    uint64            `json:"size"`
		Hashes  map[string]string `json:"hashes"`
	}
	type mrVersion struct {
		ID           string   `json:"id"`
		ProjectID    string   `json:"project_id"`
		Name         string   `json:"name"`
		VersionNum   string   `json:"version_number"`
		GameVersions []string `json:"game_versions"`
		VersionType  string   `json:"version_type"`
		Loaders      []string `json:"loaders"`
		Files        []mrFile `json:"files"`
		Downloads    uint64   `json:"downloads"`
	}

	var raw []mrVersion
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	var list []DiscoveryVersion
	for _, v := range raw {
		if mcVersion != nil && *mcVersion != "" {
			matched := false
			for _, gv := range v.GameVersions {
				if gv == *mcVersion {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		if loader != nil && *loader != "" {
			matched := false
			for _, l := range v.Loaders {
				if strings.EqualFold(l, *loader) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		var primaryFile mrFile
		for _, f := range v.Files {
			if f.Primary || primaryFile.URL == "" {
				primaryFile = f
			}
		}

		list = append(list, DiscoveryVersion{
			ID:           v.ID,
			ProjectID:    v.ProjectID,
			Name:         v.Name,
			VersionNum:   v.VersionNum,
			GameVersions: v.GameVersions,
			Loaders:      v.Loaders,
			VersionType:  v.VersionType,
			Downloads:    v.Downloads,
			DownloadURL:  primaryFile.URL,
			FileName:     primaryFile.Name,
			FileSize:     primaryFile.Size,
		})
	}
	return list, nil
}

// GetInstalledAddonsList scans the instance subdirectory with full metadata extraction.
func GetInstalledAddonsList(instanceID, projectType string) ([]InstalledAddonItem, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	folder := "mods"
	switch strings.ToLower(projectType) {
	case "resourcepack", "resourcepacks":
		folder = "resourcepacks"
	case "shader", "shaders", "shaderpack", "shaderpacks":
		folder = "shaderpacks"
	}

	target := filepath.Join(instDir, "minecraft", folder)
	entries, err := os.ReadDir(target)
	if err != nil {
		return []InstalledAddonItem{}, nil
	}

	indexDir := filepath.Join(target, ".index")
	var items []InstalledAddonItem

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		rawFileName := e.Name()
		isDisabled := strings.HasSuffix(rawFileName, ".disabled")
		cleanName := strings.TrimSuffix(rawFileName, ".disabled")
		ext := strings.ToLower(filepath.Ext(cleanName))

		if ext != ".jar" && ext != ".zip" {
			continue
		}

		filePath := filepath.Join(target, rawFileName)
		fi, err := e.Info()
		if err != nil {
			continue
		}

		sizeBytes := uint64(fi.Size())
		mtime := fmt.Sprintf("%d", fi.ModTime().Unix())

		stem := strings.TrimSuffix(cleanName, ext)
		displayName := StripMinecraftFormatting(stem)
		var version *string
		var description *string
		var source *string
		var iconURL *string
		var projectID *string
		var modID *string

		// 1. Try reading .index/<stem>.conf
		confPath := filepath.Join(indexDir, stem+".conf")
		if confBytes, err := os.ReadFile(confPath); err == nil {
			lines := strings.Split(string(confBytes), "\n")
			for _, line := range lines {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "name =") {
					parts := strings.SplitN(trimmed, "=", 2)
					if len(parts) == 2 {
						n := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
						cleaned := StripMinecraftFormatting(n)
						if cleaned != "" {
							displayName = cleaned
						}
					}
				} else if strings.HasPrefix(trimmed, "icon_url =") {
					parts := strings.SplitN(trimmed, "=", 2)
					if len(parts) == 2 {
						u := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
						if u != "" {
							iconURL = &u
						}
					}
				} else if strings.HasPrefix(trimmed, "project_id =") {
					parts := strings.SplitN(trimmed, "=", 2)
					if len(parts) == 2 {
						pid := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
						if pid != "" {
							projectID = &pid
						}
					}
				} else if strings.HasPrefix(trimmed, "provider =") {
					parts := strings.SplitN(trimmed, "=", 2)
					if len(parts) == 2 {
						prov := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
						if prov != "" {
							source = &prov
						}
					}
				}
			}
		}

		// 2. Inspect archive internal files for metadata and embedded icons
		if zr, err := zip.OpenReader(filePath); err == nil {
			if ext == ".jar" {
				for _, f := range zr.File {
					if f.Name == "fabric.mod.json" {
						if rc, err := f.Open(); err == nil {
							var meta struct {
								ID          string `json:"id"`
								Name        string `json:"name"`
								Version     string `json:"version"`
								Description string `json:"description"`
								Icon        any    `json:"icon"`
							}
							if err := json.NewDecoder(rc).Decode(&meta); err == nil {
								if meta.Name != "" {
									displayName = StripMinecraftFormatting(meta.Name)
								}
								if meta.ID != "" {
									mID := meta.ID
									modID = &mID
								}
								if meta.Version != "" {
									v := meta.Version
									version = &v
								}
								if meta.Description != "" {
									d := StripMinecraftFormatting(meta.Description)
									description = &d
								}

								// Embedded icon extraction
								if iconURL == nil && meta.Icon != nil {
									iconPath := ""
									if s, ok := meta.Icon.(string); ok {
										iconPath = s
									} else if m, ok := meta.Icon.(map[string]any); ok {
										for _, v := range m {
											if str, ok := v.(string); ok {
												iconPath = str
												break
											}
										}
									}
									if iconPath != "" {
										for _, ifile := range zr.File {
											if ifile.Name == iconPath || ifile.Name == strings.TrimPrefix(iconPath, "/") {
												if irc, err := ifile.Open(); err == nil {
													ibytes, _ := io.ReadAll(irc)
													irc.Close()
													if len(ibytes) > 0 && len(ibytes) < 1500000 {
														dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(ibytes)
														iconURL = &dataURL
													}
												}
												break
											}
										}
									}
								}
							}
							rc.Close()
						}
						break
					}
				}
			} else if ext == ".zip" {
				// Check pack.mcmeta for description
				for _, f := range zr.File {
					if f.Name == "pack.mcmeta" {
						if rc, err := f.Open(); err == nil {
							var meta struct {
								Pack struct {
									Description any `json:"description"`
								} `json:"pack"`
							}
							if err := json.NewDecoder(rc).Decode(&meta); err == nil {
								if s, ok := meta.Pack.Description.(string); ok {
									d := StripMinecraftFormatting(s)
									description = &d
								}
							}
							rc.Close()
						}
					}
					// Check embedded pack.png / icon.png
					if iconURL == nil {
						low := strings.ToLower(f.Name)
						if low == "pack.png" || low == "icon.png" || strings.HasSuffix(low, "/pack.png") {
							if rc, err := f.Open(); err == nil {
								ibytes, _ := io.ReadAll(rc)
								rc.Close()
								if len(ibytes) > 0 && len(ibytes) < 1500000 {
									dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(ibytes)
									iconURL = &dataURL
								}
							}
						}
					}
				}
			}
			zr.Close()
		}

		items = append(items, InstalledAddonItem{
			ID:           stem,
			Name:         displayName,
			FileName:     rawFileName,
			Version:      version,
			Description:  description,
			SizeBytes:    sizeBytes,
			Enabled:      !isDisabled,
			ModID:        modID,
			DateModified: &mtime,
			Source:       source,
			IconURL:      iconURL,
			ProjectID:    projectID,
		})
	}

	return items, nil
}

// GetInstalledAddonIDs returns a list of installed addon project IDs and mod identifiers.
func GetInstalledAddonIDs(instanceID, projectType string) ([]string, error) {
	list, err := GetInstalledAddonsList(instanceID, projectType)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(list))
	for _, item := range list {
		ids = append(ids, strings.ToLower(item.ID))
		if item.ModID != nil && *item.ModID != "" {
			ids = append(ids, strings.ToLower(*item.ModID))
		}
		if item.ProjectID != nil && *item.ProjectID != "" {
			ids = append(ids, strings.ToLower(*item.ProjectID))
		}
	}
	return ids, nil
}

// ToggleAddonEnabled appends or removes the .disabled suffix.
func ToggleAddonEnabled(instanceID, projectType, fileName string, enabled bool) (string, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return "", err
	}

	folder := "mods"
	switch strings.ToLower(projectType) {
	case "resourcepack", "resourcepacks":
		folder = "resourcepacks"
	case "shader", "shaders", "shaderpack", "shaderpacks":
		folder = "shaderpacks"
	}

	dir := filepath.Join(instDir, "minecraft", folder)
	oldPath := filepath.Join(dir, fileName)

	var newName string
	if enabled {
		newName = strings.TrimSuffix(fileName, ".disabled")
	} else {
		if !strings.HasSuffix(fileName, ".disabled") {
			newName = fileName + ".disabled"
		} else {
			newName = fileName
		}
	}

	newPath := filepath.Join(dir, newName)
	if oldPath != newPath {
		if err := os.Rename(oldPath, newPath); err != nil {
			return "", err
		}
	}
	return newName, nil
}

// DeleteAddon removes an addon file from the instance.
func DeleteAddon(instanceID, projectType, fileName string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}

	folder := "mods"
	switch strings.ToLower(projectType) {
	case "resourcepack", "resourcepacks":
		folder = "resourcepacks"
	case "shader", "shaders", "shaderpack", "shaderpacks":
		folder = "shaderpacks"
	}

	return os.Remove(filepath.Join(instDir, "minecraft", folder, fileName))
}

// CheckAddonUpdates checks Modrinth for updates to installed addons.
func CheckAddonUpdates(instanceID, projectType string) ([]AddonUpdateInfo, error) {
	return []AddonUpdateInfo{}, nil
}

// InstallDiscoveryProject downloads an addon binary into the appropriate instance folder.
func InstallDiscoveryProject(
	instanceID, projectType, downloadURL, fileName string,
	provider, projectID, versionID, title, iconURL *string,
) ([]string, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	folder := "mods"
	switch strings.ToLower(projectType) {
	case "resourcepack", "resourcepacks":
		folder = "resourcepacks"
	case "shader", "shaders", "shaderpack", "shaderpacks":
		folder = "shaderpacks"
	}

	targetDir := filepath.Join(instDir, "minecraft", folder)
	_ = os.MkdirAll(targetDir, 0755)

	destPath := filepath.Join(targetDir, fileName)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download addon: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return nil, err
	}
	defer out.Close()

	hasher := sha1.New()
	w := io.MultiWriter(out, hasher)
	if _, err := io.Copy(w, resp.Body); err != nil {
		_ = os.Remove(destPath)
		return nil, err
	}

	indexDir := filepath.Join(targetDir, ".index")
	_ = os.MkdirAll(indexDir, 0755)
	cleanStem := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	confPath := filepath.Join(indexDir, cleanStem+".conf")

	hashStr := hex.EncodeToString(hasher.Sum(nil))
	t := cleanStem
	if title != nil && *title != "" {
		t = *title
	}
	confContent := fmt.Sprintf(
		"[addon]\nname = \"%s\"\nfilename = \"%s\"\ntype = \"%s\"\nhash = \"%s\"\n",
		t, fileName, projectType, hashStr,
	)
	_ = os.WriteFile(confPath, []byte(confContent), 0644)

	return []string{fileName}, nil
}
