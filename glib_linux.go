//go:build linux

package main

import (
	"github.com/ebitengine/purego"
)

// initPlatformPrgname sets glib prgname and application name on Linux
// so that WebKitGTK initializes web storage in ~/.local/share/SeraLauncher
func initPlatformPrgname(name string) {
	lib, err := purego.Dlopen("libglib-2.0.so.0", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return
	}

	var gSetPrgname func(prgname *byte)
	var gSetApplicationName func(appName *byte)

	purego.RegisterLibFunc(&gSetPrgname, lib, "g_set_prgname")
	purego.RegisterLibFunc(&gSetApplicationName, lib, "g_set_application_name")

	cName := append([]byte(name), 0)
	if gSetPrgname != nil {
		gSetPrgname(&cName[0])
	}
	if gSetApplicationName != nil {
		gSetApplicationName(&cName[0])
	}
}
