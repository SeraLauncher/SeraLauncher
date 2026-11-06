package main

import (
	"log"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/updater"
	"serago/internal/api"
	"serago/internal/discord"
	"serago/internal/paths"
)

func main() {
	initPlatformPrgname("SeraLauncher")
	mygo.App.SetName("SeraLauncher")
	paths.MigrateLegacyDataDir()
	discord.Init()
	mygo.Use(updater.Plugin)

	mygo.Bind(
		api.SettingsService{},
		api.SystemService{},
		api.DiscordService{},
		api.JavaService{},
		api.AuthService{},
		api.InstanceService{},
		api.MinecraftService{},
		api.LoaderService{},
		api.DiscoveryService{},
		api.WorldService{},
		api.ServerService{},
		api.VisualService{},
		api.ModpackService{},
		api.DownloadService{},
		api.SafetyService{},
		api.ExportService{},
		api.IngestService{},
		api.UpdateService{},
	)

	mygo.App.WhenReady(func() {
		mygo.NewWindow(mygo.WindowOptions{
			Title:           "Sera",
			Width:           1080,
			Height:          700,
			MinWidth:        900,
			MinHeight:       600,
			BackgroundColor: "#161413",
			StateKey:        "main",
			URL:             "/",
		})
	})

	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
