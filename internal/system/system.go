package system

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
)

// TotalMemoryMB returns the host system's total physical memory in megabytes (MB).
// ponytail: stdlib and platform queries without cgo
func TotalMemoryMB() uint32 {
	switch runtime.GOOS {
	case "linux":
		return linuxTotalMemoryMB()
	default:
		// safe conservative default for macOS/Windows fallback: 8192 MB
		return 8192
	}
}

func linuxTotalMemoryMB() uint32 {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 8192
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseUint(fields[1], 10, 64)
				if err == nil && kb > 0 {
					return uint32(kb / 1024)
				}
			}
		}
	}
	return 8192
}
