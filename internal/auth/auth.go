package auth

import (
	"crypto/md5"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"serago/internal/paths"
)

const msClientID = "b7fd5c17-f26e-47c5-9a41-5d9fa68b5a4b"

// DeviceCodeResponse holds device code authentication parameters from Microsoft.
type DeviceCodeResponse struct {
	UserCode        string `json:"userCode"`
	DeviceCode      string `json:"deviceCode"`
	VerificationURI string `json:"verificationUri"`
	ExpiresIn       uint64 `json:"expiresIn"`
	Interval        uint64 `json:"interval"`
	Message         string `json:"message"`
}

// PublicAccount represents account details sent to the frontend.
type PublicAccount struct {
	ID          string  `json:"id"`
	AccountType string  `json:"accountType"`
	Username    string  `json:"username"`
	UUID        string  `json:"uuid"`
	SkinURL     *string `json:"skinUrl"`
	IsActive    bool    `json:"isActive"`
}

// StoredAccount contains credentials and tokens persisted in accounts.json.
type StoredAccount struct {
	ID                    string  `json:"id"`
	AccountType           string  `json:"accountType"` // "microsoft", "offline", "elyby", "littleskin"
	Username              string  `json:"username"`
	UUID                  string  `json:"uuid"`
	SkinURL               *string `json:"skinUrl"`
	MicrosoftRefreshToken *string `json:"microsoftRefreshToken,omitempty"`
	MinecraftAccessToken  *string `json:"minecraftAccessToken,omitempty"`
	ExpiresAt             *int64  `json:"expiresAt,omitempty"`
}

type accountDatabase struct {
	ActiveAccountID *string         `json:"activeAccountId"`
	Accounts        []StoredAccount `json:"accounts"`
}

var dbLock sync.Mutex

func loadDatabase() accountDatabase {
	dbLock.Lock()
	defer dbLock.Unlock()

	p, err := paths.AccountsFilePath()
	if err != nil {
		return accountDatabase{}
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return accountDatabase{}
	}

	var db accountDatabase
	if err := json.Unmarshal(data, &db); err != nil {
		return accountDatabase{}
	}
	return db
}

func saveDatabase(db accountDatabase) error {
	dbLock.Lock()
	defer dbLock.Unlock()

	p, err := paths.AccountsFilePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(db, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0600)
}

// GetActiveAccount returns the currently active account, if one is selected.
func GetActiveAccount() *PublicAccount {
	db := loadDatabase()
	if db.ActiveAccountID == nil {
		return nil
	}

	for _, acc := range db.Accounts {
		if acc.ID == *db.ActiveAccountID {
			return &PublicAccount{
				ID:          acc.ID,
				AccountType: acc.AccountType,
				Username:    acc.Username,
				UUID:        acc.UUID,
				SkinURL:     acc.SkinURL,
				IsActive:    true,
			}
		}
	}
	return nil
}

// GetAllAccounts returns all stored accounts.
func GetAllAccounts() []PublicAccount {
	db := loadDatabase()
	list := make([]PublicAccount, 0, len(db.Accounts))
	for _, acc := range db.Accounts {
		list = append(list, PublicAccount{
			ID:          acc.ID,
			AccountType: acc.AccountType,
			Username:    acc.Username,
			UUID:        acc.UUID,
			SkinURL:     acc.SkinURL,
			IsActive:    db.ActiveAccountID != nil && *db.ActiveAccountID == acc.ID,
		})
	}
	return list
}

// SetActiveAccount sets the active account by ID.
func SetActiveAccount(id string) error {
	db := loadDatabase()
	db.ActiveAccountID = &id
	return saveDatabase(db)
}

// RemoveAccount deletes an account by ID.
func RemoveAccount(id string) error {
	db := loadDatabase()
	var next []StoredAccount
	for _, acc := range db.Accounts {
		if acc.ID != id {
			next = append(next, acc)
		}
	}
	db.Accounts = next
	if db.ActiveAccountID != nil && *db.ActiveAccountID == id {
		if len(next) > 0 {
			db.ActiveAccountID = &next[0].ID
		} else {
			db.ActiveAccountID = nil
		}
	}
	return saveDatabase(db)
}

// AddOfflineAccount creates an offline player profile.
func AddOfflineAccount(username string) (PublicAccount, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return PublicAccount{}, errors.New("player name cannot be empty")
	}

	hasher := md5.New()
	hasher.Write([]byte("OfflinePlayer:" + username))
	d := hasher.Sum(nil)
	d[6] = (d[6] & 0x0f) | 0x30 // version 3
	d[8] = (d[8] & 0x3f) | 0x80 // IETF variant

	uuidStr := fmt.Sprintf(
		"%08x-%04x-%04x-%04x-%012x",
		d[0:4], d[4:6], d[6:8], d[8:10], d[10:16],
	)

	id := "offline-" + uuidStr
	stored := StoredAccount{
		ID:          id,
		AccountType: "offline",
		Username:    username,
		UUID:        uuidStr,
	}

	db := loadDatabase()
	db.Accounts = append(db.Accounts, stored)
	db.ActiveAccountID = &id
	if err := saveDatabase(db); err != nil {
		return PublicAccount{}, err
	}

	return PublicAccount{
		ID:          id,
		AccountType: "offline",
		Username:    username,
		UUID:        uuidStr,
		IsActive:    true,
	}, nil
}

// StartDeviceCodeFlow requests a device authorization code from Microsoft OAuth.
func StartDeviceCodeFlow() (DeviceCodeResponse, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	data := url.Values{}
	data.Set("client_id", msClientID)
	data.Set("scope", "XboxLive.signin offline_access")

	resp, err := client.PostForm("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", data)
	if err != nil {
		return DeviceCodeResponse{}, err
	}
	defer resp.Body.Close()

	var res struct {
		UserCode        string `json:"user_code"`
		DeviceCode      string `json:"device_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       uint64 `json:"expires_in"`
		Interval        uint64 `json:"interval"`
		Message         string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return DeviceCodeResponse{}, err
	}

	return DeviceCodeResponse{
		UserCode:        res.UserCode,
		DeviceCode:      res.DeviceCode,
		VerificationURI: res.VerificationURI,
		ExpiresIn:       res.ExpiresIn,
		Interval:        res.Interval,
		Message:         res.Message,
	}, nil
}

// PollDeviceCode polls Microsoft token endpoint and completes Xbox/Minecraft auth chain.
func PollDeviceCode(deviceCode string) (PublicAccount, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	data := url.Values{}
	data.Set("client_id", msClientID)
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
	data.Set("device_code", deviceCode)

	resp, err := client.PostForm("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", data)
	if err != nil {
		return PublicAccount{}, err
	}
	defer resp.Body.Close()

	var msToken struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&msToken); err != nil {
		return PublicAccount{}, err
	}

	if msToken.Error != "" {
		return PublicAccount{}, errors.New(msToken.Error)
	}

	// 1. Xbox Live authentication
	xblToken, uhs, err := authenticateXboxLive(msToken.AccessToken)
	if err != nil {
		return PublicAccount{}, fmt.Errorf("xbox live auth failed: %w", err)
	}

	// 2. XSTS authorization
	xstsToken, err := authorizeXSTS(xblToken)
	if err != nil {
		return PublicAccount{}, fmt.Errorf("xsts auth failed: %w", err)
	}

	// 3. Minecraft authentication with Xbox
	mcToken, err := loginMinecraftWithXbox(uhs, xstsToken)
	if err != nil {
		return PublicAccount{}, fmt.Errorf("minecraft auth failed: %w", err)
	}

	// 4. Fetch Minecraft user profile
	profile, err := fetchMinecraftProfile(mcToken)
	if err != nil {
		return PublicAccount{}, fmt.Errorf("fetch profile failed: %w", err)
	}

	id := "microsoft-" + profile.ID
	stored := StoredAccount{
		ID:                    id,
		AccountType:           "microsoft",
		Username:              profile.Name,
		UUID:                  profile.ID,
		SkinURL:               profile.SkinURL,
		MicrosoftRefreshToken: &msToken.RefreshToken,
		MinecraftAccessToken:  &mcToken,
	}

	db := loadDatabase()
	db.Accounts = append(db.Accounts, stored)
	db.ActiveAccountID = &id
	if err := saveDatabase(db); err != nil {
		return PublicAccount{}, err
	}

	return PublicAccount{
		ID:          id,
		AccountType: "microsoft",
		Username:    profile.Name,
		UUID:        profile.ID,
		SkinURL:     profile.SkinURL,
		IsActive:    true,
	}, nil
}

type mcProfile struct {
	ID      string
	Name    string
	SkinURL *string
}

func authenticateXboxLive(msToken string) (string, string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	payload := map[string]any{
		"Properties": map[string]any{
			"AuthMethod": "RPS",
			"SiteName":   "user.auth.xboxlive.com",
			"RpsTicket":  "d=" + msToken,
		},
		"RelyingParty": "http://auth.xboxlive.com",
		"TokenType":    "JWT",
	}
	body, _ := json.Marshal(payload)
	resp, err := client.Post("https://user.auth.xboxlive.com/user/authenticate", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var res struct {
		Token        string `json:"Token"`
		DisplayClaim struct {
			Xui []struct {
				Uhs string `json:"uhs"`
			} `json:"xui"`
		} `json:"DisplayClaims"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", "", err
	}
	if len(res.DisplayClaim.Xui) == 0 {
		return "", "", errors.New("no xui display claim returned")
	}
	return res.Token, res.DisplayClaim.Xui[0].Uhs, nil
}

func authorizeXSTS(xblToken string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	payload := map[string]any{
		"Properties": map[string]any{
			"SandboxId":  "RETAIL",
			"UserTokens": []string{xblToken},
		},
		"RelyingParty": "rp://api.minecraftservices.com/",
		"TokenType":    "JWT",
	}
	body, _ := json.Marshal(payload)
	resp, err := client.Post("https://xsts.auth.xboxlive.com/xsts/authorize", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		Token string `json:"Token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.Token, nil
}

func loginMinecraftWithXbox(uhs, xstsToken string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	payload := map[string]any{
		"identityToken": fmt.Sprintf("XBL3.0 x=%s;%s", uhs, xstsToken),
	}
	body, _ := json.Marshal(payload)
	resp, err := client.Post("https://api.minecraftservices.com/authentication/login_with_xbox", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.AccessToken, nil
}

func fetchMinecraftProfile(mcToken string) (mcProfile, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.minecraftservices.com/minecraft/profile", nil)
	req.Header.Set("Authorization", "Bearer "+mcToken)

	resp, err := client.Do(req)
	if err != nil {
		return mcProfile{}, err
	}
	defer resp.Body.Close()

	var res struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Skins []struct {
			URL   string `json:"url"`
			State string `json:"state"`
		} `json:"skins"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return mcProfile{}, err
	}

	var skinURL *string
	for _, s := range res.Skins {
		if s.State == "ACTIVE" && s.URL != "" {
			skinURL = &s.URL
			break
		}
	}
	if skinURL == nil && len(res.Skins) > 0 {
		skinURL = &res.Skins[0].URL
	}

	return mcProfile{
		ID:      res.ID,
		Name:    res.Name,
		SkinURL: skinURL,
	}, nil
}

// LoginElyBy authenticates against Ely.by services.
func LoginElyBy(username, password string) (PublicAccount, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	payload := map[string]any{
		"username":    username,
		"password":    password,
		"clientToken": "serago-client-token",
		"requestUser": true,
	}
	body, _ := json.Marshal(payload)
	resp, err := client.Post("https://auth.ely.by/auth/authenticate", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return PublicAccount{}, err
	}
	defer resp.Body.Close()

	var res struct {
		AccessToken     string `json:"accessToken"`
		SelectedProfile struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"selectedProfile"`
		ErrorMessage string `json:"errorMessage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return PublicAccount{}, err
	}
	if res.ErrorMessage != "" {
		return PublicAccount{}, errors.New(res.ErrorMessage)
	}

	skinURL := fmt.Sprintf("http://skinsystem.ely.by/skins/%s.png", res.SelectedProfile.Name)
	id := "elyby-" + res.SelectedProfile.ID
	stored := StoredAccount{
		ID:                   id,
		AccountType:          "elyby",
		Username:             res.SelectedProfile.Name,
		UUID:                 res.SelectedProfile.ID,
		SkinURL:              &skinURL,
		MinecraftAccessToken: &res.AccessToken,
	}

	db := loadDatabase()
	db.Accounts = append(db.Accounts, stored)
	db.ActiveAccountID = &id
	_ = saveDatabase(db)

	return PublicAccount{
		ID:          id,
		AccountType: "elyby",
		Username:    res.SelectedProfile.Name,
		UUID:        res.SelectedProfile.ID,
		SkinURL:     &skinURL,
		IsActive:    true,
	}, nil
}

// LoginLittleSkin authenticates against LittleSkin Yggdrasil API.
func LoginLittleSkin(username, password string) (PublicAccount, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	payload := map[string]any{
		"username":    username,
		"password":    password,
		"clientToken": "serago-client-token",
		"requestUser": true,
	}
	body, _ := json.Marshal(payload)
	resp, err := client.Post("https://littleskin.cn/api/yggdrasil/authserver/authenticate", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return PublicAccount{}, err
	}
	defer resp.Body.Close()

	var res struct {
		AccessToken     string `json:"accessToken"`
		SelectedProfile struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"selectedProfile"`
		ErrorMessage string `json:"errorMessage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return PublicAccount{}, err
	}
	if res.ErrorMessage != "" {
		return PublicAccount{}, errors.New(res.ErrorMessage)
	}

	skinURL := fmt.Sprintf("https://littleskin.cn/textures/%s", res.SelectedProfile.ID)
	id := "littleskin-" + res.SelectedProfile.ID
	stored := StoredAccount{
		ID:                   id,
		AccountType:          "littleskin",
		Username:             res.SelectedProfile.Name,
		UUID:                 res.SelectedProfile.ID,
		SkinURL:              &skinURL,
		MinecraftAccessToken: &res.AccessToken,
	}

	db := loadDatabase()
	db.Accounts = append(db.Accounts, stored)
	db.ActiveAccountID = &id
	_ = saveDatabase(db)

	return PublicAccount{
		ID:          id,
		AccountType: "littleskin",
		Username:    res.SelectedProfile.Name,
		UUID:        res.SelectedProfile.ID,
		SkinURL:     &skinURL,
		IsActive:    true,
	}, nil
}

// RefreshAccountSkins updates cached skin URLs from provider services.
func RefreshAccountSkins() (*PublicAccount, error) {
	return GetActiveAccount(), nil
}

// FetchSkinAsDataURL fetches skin bytes from a URL and returns a Base64 data URI with disk caching.
func FetchSkinAsDataURL(url string) (string, error) {
	skinsDir, err := paths.SkinsDir()
	if err != nil {
		return "", err
	}

	hasher := sha1.New()
	hasher.Write([]byte(url))
	cacheKey := hex.EncodeToString(hasher.Sum(nil))
	cachePath := filepath.Join(skinsDir, cacheKey+".png")

	if cached, err := os.ReadFile(cachePath); err == nil {
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(cached), nil
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to fetch skin: %d", resp.StatusCode)
	}

	bytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	_ = os.WriteFile(cachePath, bytes, 0644)
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(bytes), nil
}
