package api

import (
	"github.com/egoist/mygo"
)

// Events emitted from Go to the frontend.
var (
	InstancesChanged        = mygo.NewEvent[any]("instances_changed")
	RunningInstancesChanged = mygo.NewEvent[any]("running_instances_changed")
	DownloadsChanged        = mygo.NewEvent[any]("downloads_changed")
)
