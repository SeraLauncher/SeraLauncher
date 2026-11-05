package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"serago/internal/paths"
)

const (
	DefaultAppearance   = "dark"
	BundledFamily       = "Sunghyun Sans"
	DefaultFontSize     = 16
	MinFontSize         = 12
	MaxFontSize         = 20
	DefaultZoom         = 100
	MinZoom             = 70
	MaxZoom             = 150
	DefaultMinMemory    = 2048
	DefaultMaxMemory    = 4096
	DefaultGcPreset     = "g1gc"
	DefaultJavaOptimize = true
	DefaultJvmArgs      = ""
	DefaultDiscordRpc   = true
	DefaultDiscordDet   = true
)

var defaultEnabledAnimations = []string{
	"dynamic_idle",
	"walking",
	"levitation_float",
	"elytra_soar",
	"sleepy_nod_off",
}

// DefaultEnabledAnimations returns the default list of enabled animation IDs.
func DefaultEnabledAnimations() []string {
	return append([]string(nil), defaultEnabledAnimations...)
}

// Settings represents launcher user preferences.
type Settings struct {
	Appearance        string   `json:"appearance"`
	Font              string   `json:"font"`
	FontSize          uint32   `json:"fontSize"`
	Zoom              uint32   `json:"zoom"`
	JavaPath          *string  `json:"javaPath"`
	MinMemory         uint32   `json:"minMemory"`
	MaxMemory         uint32   `json:"maxMemory"`
	GcPreset          string   `json:"gcPreset"`
	JavaOptimize      bool     `json:"javaOptimize"`
	JvmArgs           string   `json:"jvmArgs"`
	DiscordRpc        bool     `json:"discordRpc"`
	DiscordDetailed   bool     `json:"discordDetailed"`
	EnabledAnimations []string `json:"enabledAnimations"`
}

// Defaults returns a default initialized Settings struct.
func Defaults() Settings {
	return Settings{
		Appearance:        DefaultAppearance,
		Font:              BundledFamily,
		FontSize:          DefaultFontSize,
		Zoom:              DefaultZoom,
		JavaPath:          nil,
		MinMemory:         DefaultMinMemory,
		MaxMemory:         DefaultMaxMemory,
		GcPreset:          DefaultGcPreset,
		JavaOptimize:      DefaultJavaOptimize,
		JvmArgs:           DefaultJvmArgs,
		DiscordRpc:        DefaultDiscordRpc,
		DiscordDetailed:   DefaultDiscordDet,
		EnabledAnimations: DefaultEnabledAnimations(),
	}
}

// Sanitized ensures all settings values lie within accepted bounds.
func (s Settings) Sanitized() Settings {
	if s.Appearance != "dark" && s.Appearance != "light" {
		s.Appearance = DefaultAppearance
	}
	if strings.TrimSpace(s.Font) == "" {
		s.Font = BundledFamily
	}

	if s.FontSize < MinFontSize {
		s.FontSize = MinFontSize
	} else if s.FontSize > MaxFontSize {
		s.FontSize = MaxFontSize
	}

	if s.Zoom < MinZoom {
		s.Zoom = MinZoom
	} else if s.Zoom > MaxZoom {
		s.Zoom = MaxZoom
	}

	if s.JavaPath != nil {
		trimmed := strings.TrimSpace(*s.JavaPath)
		if trimmed == "" {
			s.JavaPath = nil
		} else {
			s.JavaPath = &trimmed
		}
	}

	if s.MinMemory < 512 {
		s.MinMemory = 512
	} else if s.MinMemory > 65536 {
		s.MinMemory = 65536
	}

	if s.MaxMemory < s.MinMemory {
		s.MaxMemory = s.MinMemory
	} else if s.MaxMemory > 65536 {
		s.MaxMemory = 65536
	}

	gc := strings.ToLower(s.GcPreset)
	if gc != "none" && gc != "g1gc" && gc != "zgc" {
		s.GcPreset = DefaultGcPreset
	} else {
		s.GcPreset = gc
	}

	validAnims := map[string]bool{
		"dynamic_idle":     true,
		"walking":          true,
		"levitation_float": true,
		"elytra_soar":      true,
		"sleepy_nod_off":   true,
	}

	var cleanedAnims []string
	for _, a := range s.EnabledAnimations {
		if validAnims[a] {
			cleanedAnims = append(cleanedAnims, a)
		}
	}
	if len(cleanedAnims) == 0 {
		cleanedAnims = DefaultEnabledAnimations()
	}
	s.EnabledAnimations = cleanedAnims

	return s
}

// Load reads the settings file from disk with safe fallback.
func Load() Settings {
	file, err := paths.SettingsFilePath()
	if err != nil {
		return Defaults()
	}

	data, err := os.ReadFile(file)
	if err != nil {
		return Defaults()
	}

	s := Defaults()
	if err := json.Unmarshal(data, &s); err != nil {
		return Defaults()
	}
	return s.Sanitized()
}

// Save writes settings to the platform configuration file.
func Save(s Settings) error {
	file, err := paths.SettingsFilePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		return err
	}

	sanitized := s.Sanitized()
	data, err := json.MarshalIndent(sanitized, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(file, data, 0644)
}
