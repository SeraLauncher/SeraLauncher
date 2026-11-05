package api

import (
	"github.com/egoist/mygo"
	"serago/internal/downloader"
	"serago/internal/instances"
	"serago/internal/minecraft"
)

// InstanceLogPayload describes a streamed log line.
type InstanceLogPayload struct {
	ID   string `json:"id"`
	Line string `json:"line"`
}

// Events emitted from Go to the frontend.
var (
	InstancesChanged        = mygo.NewEvent[string]("instances_changed")
	RunningInstancesChanged = mygo.NewEvent[[]minecraft.RunningInstanceInfo]("running_instances_changed")
	DownloadsChanged        = mygo.NewEvent[[]downloader.DownloadItem]("downloads_changed")
	InstanceLogLine         = mygo.NewEvent[InstanceLogPayload]("instance_log_line")
)

func init() {
	minecraft.OnLogLine(func(id, line string) {
		_ = InstanceLogLine.Broadcast(InstanceLogPayload{
			ID:   id,
			Line: line,
		})
	})

	minecraft.OnProcessExit(func(id string, elapsedSecs uint64) {
		_ = instances.AddPlayTime(id, elapsedSecs)
		_ = RunningInstancesChanged.Broadcast(minecraft.ListRunningInstances())
		_ = InstancesChanged.Broadcast("changed")
	})
}
