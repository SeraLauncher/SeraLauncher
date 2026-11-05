package minecraft

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// MinecraftVersion describes a release or snapshot version entry.
type MinecraftVersion struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	URL         string `json:"url"`
	Time        string `json:"time"`
	ReleaseTime string `json:"releaseTime"`
	Sha1        string `json:"sha1"`
}

// MinecraftVersionsResponse is returned by get_minecraft_versions.
type MinecraftVersionsResponse struct {
	Latest struct {
		Release  string `json:"release"`
		Snapshot string `json:"snapshot"`
	} `json:"latest"`
	Versions []MinecraftVersion `json:"versions"`
}

// NewsEntry represents Minecraft official news.
type NewsEntry struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	URL          string   `json:"url"`
	Image        string   `json:"image"`
	ImageAltText *string  `json:"imageAltText,omitempty"`
	Author       *string  `json:"author,omitempty"`
	Time         *int64   `json:"time,omitempty"`
	Tags         []string `json:"tags"`
	Category     *string  `json:"category,omitempty"`
}

// NewsResponse is returned by fetch_minecraft_news.
type NewsResponse struct {
	Entries []NewsEntry `json:"entries"`
	Total   *uint32     `json:"total,omitempty"`
}

var (
	versionCacheLock sync.Mutex
	cachedVersions   *MinecraftVersionsResponse
	cachedVersionAt  time.Time
)

// FetchMinecraftVersions fetches official version manifest with 1 hour caching.
func FetchMinecraftVersions() (MinecraftVersionsResponse, error) {
	versionCacheLock.Lock()
	defer versionCacheLock.Unlock()

	if cachedVersions != nil && time.Since(cachedVersionAt) < time.Hour {
		return *cachedVersions, nil
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
	if err != nil {
		if cachedVersions != nil {
			return *cachedVersions, nil
		}
		return MinecraftVersionsResponse{}, err
	}
	defer resp.Body.Close()

	var result MinecraftVersionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return MinecraftVersionsResponse{}, err
	}

	cachedVersions = &result
	cachedVersionAt = time.Now()
	return result, nil
}

// FetchMinecraftNews queries Mojang's official Java news endpoint.
func FetchMinecraftNews(pageSize uint32) (NewsResponse, error) {
	if pageSize == 0 || pageSize > 50 {
		pageSize = 4
	}

	url := fmt.Sprintf(
		"https://net-secondary.web.minecraft-services.net/api/v1.0/en-us/search?pageSize=%d&sortType=Recent&category=News&newsOnly=true&filter%%5Bsubscription%%5D=Minecraft%%3A+Java",
		pageSize,
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return NewsResponse{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return NewsResponse{Entries: []NewsEntry{}}, nil
	}
	defer resp.Body.Close()

	type rawNewsResponse struct {
		Result struct {
			Results  []NewsEntry `json:"results"`
			NumFound *uint32     `json:"numFound"`
		} `json:"result"`
		Entries []NewsEntry `json:"entries"`
		Total   *uint32     `json:"total"`
	}

	var raw rawNewsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return NewsResponse{Entries: []NewsEntry{}}, nil
	}

	entries := raw.Result.Results
	if len(entries) == 0 {
		entries = raw.Entries
	}
	total := raw.Result.NumFound
	if total == nil {
		total = raw.Total
	}

	return NewsResponse{
		Entries: entries,
		Total:   total,
	}, nil
}
