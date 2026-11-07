package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultsAndSanitization(t *testing.T) {
	s := Defaults()
	if s.Appearance != "dark" {
		t.Fatalf("expected dark, got %s", s.Appearance)
	}
	if s.FontSize != DefaultFontSize {
		t.Fatalf("expected %d, got %d", DefaultFontSize, s.FontSize)
	}

	// Clamping
	s.FontSize = 999
	s.Zoom = 10
	s.Appearance = "neon"
	s.LightTheme = "matrix"
	s.DarkTheme = "papyrus"
	s = s.Sanitized()

	if s.FontSize != MaxFontSize {
		t.Fatalf("expected clamped font size %d, got %d", MaxFontSize, s.FontSize)
	}
	if s.Zoom != MinZoom {
		t.Fatalf("expected clamped zoom %d, got %d", MinZoom, s.Zoom)
	}
	if s.Appearance != DefaultAppearance {
		t.Fatalf("expected default appearance %s, got %s", DefaultAppearance, s.Appearance)
	}
	if s.LightTheme != DefaultThemeName {
		t.Fatalf("expected default light theme %s, got %s", DefaultThemeName, s.LightTheme)
	}
	if s.DarkTheme != DefaultThemeName {
		t.Fatalf("expected default dark theme %s, got %s", DefaultThemeName, s.DarkTheme)
	}

	s.LightTheme = "dracula"
	s.DarkTheme = "catppuccin"
	s = s.Sanitized()
	if s.LightTheme != "dracula" || s.DarkTheme != "catppuccin" {
		t.Fatalf("expected valid themes to be kept, got light=%s dark=%s", s.LightTheme, s.DarkTheme)
	}
}

func TestSaveAndLoad(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "serago-settings-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	testFile := filepath.Join(tmpDir, "settings.json")
	t.Setenv("XDG_DATA_HOME", tmpDir)

	s := Defaults()
	s.Appearance = "light"
	s.MinMemory = 1024
	s.MaxMemory = 8192

	if err := Save(s); err != nil {
		t.Fatal(err)
	}

	loaded := Load()
	if loaded.Appearance != "light" {
		t.Fatalf("expected light, got %s", loaded.Appearance)
	}
	if loaded.MinMemory != 1024 || loaded.MaxMemory != 8192 {
		t.Fatalf("unexpected memory settings: %+v", loaded)
	}

	_ = testFile
}
