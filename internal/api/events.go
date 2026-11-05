package api

import (
	"github.com/egoist/mygo"
	"serago/internal/discord"
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
		discord.NoteSessionLogLine(id, line)
		_ = InstanceLogLine.Broadcast(InstanceLogPayload{
			ID:   id,
			Line: line,
		})
	})

	minecraft.OnProcessStart(func(info minecraft.RunningInstanceInfo) {
		discord.SessionStart(info.ID, info.Name, info.McVersion, info.StartedAt)
	})

	minecraft.OnProcessExit(func(id string, elapsedSecs uint64) {
		discord.SessionExit(id)
		_ = instances.AddPlayTime(id, elapsedSecs)
		_ = RunningInstancesChanged.Broadcast(minecraft.ListRunningInstances())
		_ = InstancesChanged.Broadcast("changed")
	})
}
