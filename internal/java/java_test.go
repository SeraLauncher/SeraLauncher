package java

import (
	"os"
	"testing"
)

func TestGetManagedRuntimesReturnsFourTargets(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "serago-runtimes-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("XDG_DATA_HOME", tmpDir)

	list, err := GetManagedRuntimes()
	if err != nil {
		t.Fatal(err)
	}

	if len(list) != 4 {
		t.Fatalf("expected 4 managed runtime targets, got %d", len(list))
	}

	expectedMajors := []uint32{8, 17, 21, 25}
	expectedTitles := []string{"Java 8", "Java 17", "Java 21", "Java 25"}

	for i, r := range list {
		if r.MajorVersion != expectedMajors[i] {
			t.Errorf("expected major version %d, got %d", expectedMajors[i], r.MajorVersion)
		}
		if r.Title != expectedTitles[i] {
			t.Errorf("expected title %s, got %s", expectedTitles[i], r.Title)
		}
		if r.ReleaseName == "" {
			t.Errorf("expected non-empty release name for %s", r.Title)
		}
	}
}
