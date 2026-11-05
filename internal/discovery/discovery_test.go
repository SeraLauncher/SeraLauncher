package discovery

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestStripMinecraftFormatting(t *testing.T) {
	raw := "§lE-LITE shaders 5.1"
	clean := StripMinecraftFormatting(raw)
	if clean != "E-LITE shaders 5.1" {
		t.Fatalf("expected 'E-LITE shaders 5.1', got '%s'", clean)
	}
}

func TestGetInstalledAddonsListMetadata(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "serago-addons-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	t.Setenv("XDG_DATA_HOME", tmpDir)
	instDir := filepath.Join(tmpDir, "SeraLauncher", "instance", "test-inst", "minecraft", "mods")
	if err := os.MkdirAll(instDir, 0755); err != nil {
		t.Fatal(err)
	}

	jarPath := filepath.Join(instDir, "TestMod-1.0.jar")
	f, err := os.Create(jarPath)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	w, err := zw.Create("fabric.mod.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte(`{
		"id": "testmod",
		"name": "Test Mod Title",
		"version": "1.0.0",
		"description": "Sample mod description"
	}`))
	zw.Close()
	f.Close()

	items, err := GetInstalledAddonsList("test-inst", "mods")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	item := items[0]
	if item.Name != "Test Mod Title" {
		t.Fatalf("expected 'Test Mod Title', got '%s'", item.Name)
	}
	if item.SizeBytes == 0 {
		t.Fatal("expected non-zero sizeBytes")
	}
	if item.Version == nil || *item.Version != "1.0.0" {
		t.Fatalf("expected version 1.0.0, got %+v", item.Version)
	}
}
