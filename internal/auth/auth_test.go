package auth

import (
	"os"
	"testing"
)

func TestAddOfflineAccount(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "serago-auth-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("XDG_DATA_HOME", tmpDir)

	acc, err := AddOfflineAccount("Notch")
	if err != nil {
		t.Fatal(err)
	}

	if acc.Username != "Notch" {
		t.Fatalf("expected Notch, got %s", acc.Username)
	}
	if acc.AccountType != "offline" {
		t.Fatalf("expected offline, got %s", acc.AccountType)
	}
	if acc.UUID == "" {
		t.Fatal("expected non-empty offline UUID")
	}

	all := GetAllAccounts()
	if len(all) != 1 {
		t.Fatalf("expected 1 account, got %d", len(all))
	}

	active := GetActiveAccount()
	if active == nil || active.Username != "Notch" {
		t.Fatalf("expected active account to be Notch, got %+v", active)
	}
}
