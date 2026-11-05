package fonts

import (
	"os/exec"
	"sort"
	"strings"
)

const BundledFamily = "Sunghyun Sans"

// Installed returns installed font families on the machine, with BundledFamily first.
// ponytail: uses fc-list on linux, static fallback list on other platforms without cgo
func Installed() []string {
	families := scanPlatformFonts()
	sort.Slice(families, func(i, j int) bool {
		return strings.ToLower(families[i]) < strings.ToLower(families[j])
	})

	collapsed := collapseAliases(families)
	result := make([]string, 0, len(collapsed)+1)
	result = append(result, BundledFamily)

	for _, name := range collapsed {
		if name != BundledFamily {
			result = append(result, name)
		}
	}
	return result
}

func scanPlatformFonts() []string {
	// Try fc-list on linux / BSD / macOS with fontconfig
	cmd := exec.Command("fc-list", ":", "family")
	out, err := cmd.Output()
	if err == nil {
		lines := strings.Split(string(out), "\n")
		seen := make(map[string]bool)
		var list []string
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			// fc-list may return comma-separated aliases on a single line
			parts := strings.Split(line, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" && !seen[strings.ToLower(p)] {
					seen[strings.ToLower(p)] = true
					list = append(list, p)
				}
			}
		}
		if len(list) > 0 {
			return list
		}
	}

	// Default fallback fonts across operating systems
	return []string{
		"Inter",
		"Roboto",
		"Segoe UI",
		"San Francisco",
		"Arial",
		"Noto Sans",
		"Cantarell",
		"Ubuntu",
	}
}

func collapseAliases(families []string) []string {
	var kept []string
	for _, name := range families {
		if len(kept) > 0 && strings.EqualFold(kept[len(kept)-1], name) {
			// keep uppercase spelling
			if hasUpper(name) && !hasUpper(kept[len(kept)-1]) {
				kept[len(kept)-1] = name
			}
		} else {
			kept = append(kept, name)
		}
	}
	return kept
}

func hasUpper(s string) bool {
	return strings.ToLower(s) != s
}
