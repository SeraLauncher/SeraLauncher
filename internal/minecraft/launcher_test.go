package minecraft

import (
	"regexp"
	"testing"
)

func TestHorizonReleaseNameFormatting(t *testing.T) {
	cases := []struct {
		name     string
		tag      string
		expected string
	}{
		{
			name:     "Nightly 2026-11-04 · 6475f62",
			tag:      "nightly",
			expected: "Nightly • 6475f62",
		},
		{
			name:     "Nightly 2026-11-04 · 3fb4c31",
			tag:      "nightly-2026-11-04",
			expected: "Nightly • 3fb4c31",
		},
		{
			name:     "Horizon 0.2.97: Prepare, signs and 16 more fixes",
			tag:      "v0.2.97",
			expected: "v0.2.97",
		},
	}

	for _, c := range cases {
		actual := formatHorizonReleaseName(c.name, c.tag)
		if actual != c.expected {
			t.Errorf("for (%s, %s): expected %s, got %s", c.name, c.tag, c.expected, actual)
		}
	}
}

func TestGetHorizonEngineVersionSelectsLatest(t *testing.T) {
	info, err := GetHorizonEngineVersion("test-instance")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	t.Logf("Detected CurrentVersion: %s", info.CurrentVersion)
	t.Logf("Detected LatestVersion: %s", info.LatestVersion)
	t.Logf("UpdateAvailable: %v", info.UpdateAvailable)
	t.Logf("ReleaseTag: %s", info.ReleaseTag)
	t.Logf("DownloadURL: %s", info.DownloadURL)

	if info.LatestVersion == "" || info.LatestVersion == "Nightly" {
		t.Skip("GitHub API rate limited on unauthenticated IP; skipping live release assertion")
	}

	// The nightly release moves with every upstream push, so assert the display
	// contract shape instead of pinning a remote commit hash.
	if info.LatestVersion != "" && info.LatestVersion != "Nightly" {
		re := regexp.MustCompile(`^Nightly • [0-9a-f]{7}$`)
		if !re.MatchString(info.LatestVersion) {
			t.Errorf("expected LatestVersion to match 'Nightly • <7-hex>', got %q", info.LatestVersion)
		}
	}
}
