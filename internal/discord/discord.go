package discord

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"serago/internal/auth"
	"serago/internal/settings"
)

const (
	clientID          = "965102016810594334"
	largeImage        = "seralogo"
	largeText         = "Sera launcher"
	smallImage        = "dotlogo"
	idleDetails       = "Playing Sera"
	worldSingleplayer = "Playing in Survival World"
	worldMultiplayer  = "Playing in a Server"
	maxFieldLen       = 128
)

type runningSession struct {
	ID        string
	Name      string
	McVersion string
	StartedAt uint64
}

type presenceMessage struct {
	kind         string // "nav", "session_start", "session_exit", "session_line", "config", "refresh", "reconnect", "disconnect"
	navStatus    *string
	session      *runningSession
	sessionID    string
	worldLabel   *string
	configEnable *bool
	configDetail *bool
	replyCh      chan string
}

var (
	msgChan       = make(chan presenceMessage, 64)
	initOnce      sync.Once
	startEpoch    = uint64(time.Now().Unix())
	statusMu      sync.RWMutex
	currentStatus = "stopped"
)

// GetStatus returns the current connection status: "connected", "not_connected", or "stopped".
func GetStatus() string {
	statusMu.RLock()
	defer statusMu.RUnlock()
	return currentStatus
}

func setStatus(s string) {
	statusMu.Lock()
	currentStatus = s
	statusMu.Unlock()
}

// Reconnect requests an immediate connection attempt and enables RPC.
func Reconnect() string {
	reply := make(chan string, 1)
	select {
	case msgChan <- presenceMessage{
		kind:    "reconnect",
		replyCh: reply,
	}:
		select {
		case s := <-reply:
			return s
		case <-time.After(2 * time.Second):
			return GetStatus()
		}
	default:
		return GetStatus()
	}
}

// Disconnect closes the active connection and sets status to stopped.
func Disconnect() string {
	reply := make(chan string, 1)
	select {
	case msgChan <- presenceMessage{
		kind:    "disconnect",
		replyCh: reply,
	}:
		select {
		case s := <-reply:
			return s
		case <-time.After(2 * time.Second):
			return GetStatus()
		}
	default:
		return GetStatus()
	}
}

// Init starts the background Discord Rich Presence worker goroutine.
func Init() {
	initOnce.Do(func() {
		cfg := settings.Load()
		go runWorker(cfg.DiscordRpc, cfg.DiscordDetailed)
	})
}

// SetConfig updates enabled and detailed presence flags.
func SetConfig(enabled, detailed bool) {
	select {
	case msgChan <- presenceMessage{
		kind:         "config",
		configEnable: &enabled,
		configDetail: &detailed,
	}:
	default:
	}
}

// SetNavigation updates the current launcher page status label.
func SetNavigation(status *string) {
	select {
	case msgChan <- presenceMessage{
		kind:      "nav",
		navStatus: status,
	}:
	default:
	}
}

// SessionStart notes that a game instance has launched.
func SessionStart(id, name, mcVersion string, startedAt uint64) {
	select {
	case msgChan <- presenceMessage{
		kind: "session_start",
		session: &runningSession{
			ID:        id,
			Name:      truncate(name),
			McVersion: truncate(mcVersion),
			StartedAt: startedAt,
		},
	}:
	default:
	}
}

// SessionExit notes that an instance process has stopped.
func SessionExit(id string) {
	select {
	case msgChan <- presenceMessage{
		kind:      "session_exit",
		sessionID: id,
	}:
	default:
	}
}

// NoteSessionLogLine inspects game stdout/stderr for world/server entry anchors.
func NoteSessionLogLine(id, line string) {
	var label *string
	if strings.Contains(line, "Starting integrated minecraft server") {
		v := worldSingleplayer
		label = &v
	} else if strings.Contains(line, "Connecting to") {
		v := worldMultiplayer
		label = &v
	} else if strings.Contains(line, "Stopping singleplayer server") {
		empty := ""
		label = &empty
	} else {
		return
	}

	select {
	case msgChan <- presenceMessage{
		kind:       "session_line",
		sessionID:  id,
		worldLabel: label,
	}:
	default:
	}
}

func truncate(s string) string {
	runes := []rune(s)
	if len(runes) > maxFieldLen {
		return string(runes[:maxFieldLen])
	}
	return s
}

func runWorker(initialEnabled, initialDetailed bool) {
	enabled := initialEnabled
	detailed := initialDetailed

	sessions := make(map[string]*runningSession)
	worlds := make(map[string]string)
	var currentNav *string

	var ipc net.Conn
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	syncPresence := func() {
		if !enabled {
			setStatus("stopped")
			if ipc != nil {
				_ = clearActivity(ipc)
				_ = ipc.Close()
				ipc = nil
			}
			return
		}

		if ipc == nil {
			ipc = dialDiscord()
			if ipc == nil {
				setStatus("not_connected")
				return
			}
		}

		// Determine newest active game session or fallback to launcher idle
		var newestSession *runningSession
		for _, s := range sessions {
			if newestSession == nil || s.StartedAt > newestSession.StartedAt {
				newestSession = s
			}
		}

		var details string
		var state string
		var startedAt uint64

		if newestSession != nil {
			details = newestSession.Name
			startedAt = newestSession.StartedAt
			if detailed {
				if w, ok := worlds[newestSession.ID]; ok && w != "" {
					state = w
				} else {
					state = newestSession.McVersion
				}
			}
		} else {
			details = idleDetails
			startedAt = startEpoch
			if detailed && currentNav != nil && *currentNav != "" {
				state = *currentNav
			}
		}

		accountName := largeText
		if acc := auth.GetActiveAccount(); acc != nil && acc.Username != "" {
			accountName = acc.Username
		}

		activity := map[string]any{
			"details": details,
			"assets": map[string]any{
				"large_image": largeImage,
				"large_text":  largeText,
				"small_image": smallImage,
				"small_text":  accountName,
			},
			"timestamps": map[string]any{
				"start": startedAt,
			},
		}

		if strings.TrimSpace(state) != "" {
			activity["state"] = state
		}

		payload := map[string]any{
			"cmd": "SET_ACTIVITY",
			"args": map[string]any{
				"pid":      os.Getpid(),
				"activity": activity,
			},
			"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
		}

		data, err := json.Marshal(payload)
		if err != nil {
			return
		}

		if err := writeFrame(ipc, 1, data); err != nil {
			_ = ipc.Close()
			ipc = nil
			setStatus("not_connected")
			return
		}

		// Read response frame to prevent socket buffer backlog
		_, _, err = readFrame(ipc, time.Second)
		if err != nil {
			_ = ipc.Close()
			ipc = nil
			setStatus("not_connected")
			return
		}

		setStatus("connected")
	}

	// Trigger initial sync on startup
	syncPresence()

	for {
		select {
		case msg := <-msgChan:
			switch msg.kind {
			case "config":
				if msg.configEnable != nil {
					enabled = *msg.configEnable
				}
				if msg.configDetail != nil {
					detailed = *msg.configDetail
				}
			case "nav":
				currentNav = msg.navStatus
			case "session_start":
				if msg.session != nil {
					sessions[msg.session.ID] = msg.session
				}
			case "session_exit":
				delete(sessions, msg.sessionID)
				delete(worlds, msg.sessionID)
			case "session_line":
				if msg.worldLabel == nil || *msg.worldLabel == "" {
					delete(worlds, msg.sessionID)
				} else {
					worlds[msg.sessionID] = *msg.worldLabel
				}
			case "refresh":
				// immediate re-sync
			case "reconnect":
				enabled = true
				if ipc != nil {
					_ = ipc.Close()
					ipc = nil
				}
				syncPresence()
				if msg.replyCh != nil {
					msg.replyCh <- GetStatus()
				}
				continue
			case "disconnect":
				enabled = false
				syncPresence()
				if msg.replyCh != nil {
					msg.replyCh <- GetStatus()
				}
				continue
			}
			syncPresence()

		case <-ticker.C:
			syncPresence()
		}
	}
}

func dialDiscord() net.Conn {
	if runtime.GOOS == "windows" {
		for i := 0; i < 10; i++ {
			pipeName := fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i)
			conn, err := net.DialTimeout("pipe", pipeName, 400*time.Millisecond)
			if err == nil {
				if err := performHandshake(conn); err == nil {
					return conn
				}
				_ = conn.Close()
			}
		}
		return nil
	}

	// Unix domain sockets on Linux and macOS
	dirs := []string{
		os.Getenv("XDG_RUNTIME_DIR"),
		filepath.Join(os.Getenv("XDG_RUNTIME_DIR"), "app", "com.discordapp.Discord"),
		filepath.Join(os.Getenv("XDG_RUNTIME_DIR"), "app", "dev.vencord.Vesktop"),
		os.Getenv("TMPDIR"),
		os.Getenv("TMP"),
		"/tmp",
	}

	for _, d := range dirs {
		if d == "" {
			continue
		}
		for i := 0; i < 10; i++ {
			sock := filepath.Join(d, fmt.Sprintf("discord-ipc-%d", i))
			conn, err := net.DialTimeout("unix", sock, 400*time.Millisecond)
			if err == nil {
				if err := performHandshake(conn); err == nil {
					return conn
				}
				_ = conn.Close()
			}
		}
	}

	return nil
}

func performHandshake(conn net.Conn) error {
	hs := map[string]any{
		"v":         1,
		"client_id": clientID,
	}
	data, _ := json.Marshal(hs)
	if err := writeFrame(conn, 0, data); err != nil {
		return err
	}
	_, _, err := readFrame(conn, 2*time.Second)
	return err
}

func clearActivity(conn net.Conn) error {
	payload := map[string]any{
		"cmd": "SET_ACTIVITY",
		"args": map[string]any{
			"pid":      os.Getpid(),
			"activity": nil,
		},
		"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
	}
	data, _ := json.Marshal(payload)
	if err := writeFrame(conn, 1, data); err != nil {
		return err
	}
	_, _, _ = readFrame(conn, time.Second)
	return nil
}

func writeFrame(conn net.Conn, opcode uint32, payload []byte) error {
	hdr := make([]byte, 8)
	binary.LittleEndian.PutUint32(hdr[0:4], opcode)
	binary.LittleEndian.PutUint32(hdr[4:8], uint32(len(payload)))
	if err := conn.SetWriteDeadline(time.Now().Add(time.Second)); err != nil {
		return err
	}
	if _, err := conn.Write(hdr); err != nil {
		return err
	}
	_, err := conn.Write(payload)
	return err
}

func readFrame(conn net.Conn, timeout time.Duration) (uint32, []byte, error) {
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return 0, nil, err
	}
	hdr := make([]byte, 8)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		return 0, nil, err
	}
	opcode := binary.LittleEndian.Uint32(hdr[0:4])
	length := binary.LittleEndian.Uint32(hdr[4:8])
	body := make([]byte, length)
	if _, err := io.ReadFull(conn, body); err != nil {
		return 0, nil, err
	}
	return opcode, body, nil
}
