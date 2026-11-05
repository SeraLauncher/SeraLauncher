package downloader

import (
	"sync"
)

// DownloadItem describes a file download in progress.
type DownloadItem struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	TotalBytes     uint64 `json:"totalBytes"`
	DownloadedByte uint64 `json:"downloadedBytes"`
	SpeedBytes     uint64 `json:"speedBytes"`
	State          string `json:"state"` // "running", "paused", "completed", "error"
	InstanceName   string `json:"instanceName,omitempty"`
	InstanceIcon   string `json:"instanceIcon,omitempty"`
}

var (
	downloadMu sync.Mutex
	activeList = make(map[string]*DownloadItem)
)

// ListDownloads returns all active download items.
func ListDownloads() []DownloadItem {
	downloadMu.Lock()
	defer downloadMu.Unlock()

	var list []DownloadItem
	for _, d := range activeList {
		list = append(list, *d)
	}
	return list
}

// PauseDownload pauses a running download.
func PauseDownload(id string) {
	downloadMu.Lock()
	defer downloadMu.Unlock()
	if d, ok := activeList[id]; ok {
		d.State = "paused"
	}
}

// ResumeDownload resumes a paused download.
func ResumeDownload(id string) {
	downloadMu.Lock()
	defer downloadMu.Unlock()
	if d, ok := activeList[id]; ok {
		d.State = "running"
	}
}

// StopDownload cancels and removes a download.
func StopDownload(id string) {
	downloadMu.Lock()
	defer downloadMu.Unlock()
	delete(activeList, id)
}
