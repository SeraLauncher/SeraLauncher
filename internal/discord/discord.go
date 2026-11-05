package discord

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

const (
	clientID   = "965102016810594334"
	largeImage = "seralogo"
	largeText  = "Sera launcher"
)

var (
	connMu sync.Mutex
	ipc    net.Conn
)

// SetNavigation updates the Discord Rich Presence activity.
// ponytail: best-effort IPC pipe client without third-party C library
func SetNavigation(status *string) {
	go func() {
		connMu.Lock()
		defer connMu.Unlock()

		if ipc == nil {
			ipc = connectIPC()
			if ipc == nil {
				return
			}
		}

		details := "Playing Sera"
		state := ""
		if status != nil && *status != "" {
			state = *status
		}

		activity := map[string]any{
			"cmd": "SET_ACTIVITY",
			"args": map[string]any{
				"pid": os.Getpid(),
				"activity": map[string]any{
					"details": details,
					"state":   state,
					"assets": map[string]any{
						"large_image": largeImage,
						"large_text":  largeText,
					},
					"timestamps": map[string]any{
						"start": time.Now().Unix(),
					},
				},
			},
			"nonce": fmt.Sprintf("%d", time.Now().UnixNano()),
		}

		data, _ := json.Marshal(activity)
		_ = writeFrame(ipc, 1, data)
	}()
}

func connectIPC() net.Conn {
	switch runtime.GOOS {
	case "windows":
		// Windows named pipe
		conn, err := net.Dial("pipe", `\\.\pipe\discord-ipc-0`)
		if err == nil {
			_ = handshake(conn)
			return conn
		}
	default:
		// Unix domain socket on Linux / macOS
		dirs := []string{
			os.Getenv("XDG_RUNTIME_DIR"),
			os.Getenv("TMPDIR"),
			os.Getenv("TMP"),
			"/tmp",
		}
		for _, d := range dirs {
			if d == "" {
				continue
			}
			sock := filepath.Join(d, "discord-ipc-0")
			if conn, err := net.Dial("unix", sock); err == nil {
				if err := handshake(conn); err == nil {
					return conn
				}
				conn.Close()
			}
		}
	}
	return nil
}

func handshake(conn net.Conn) error {
	hs := map[string]any{
		"v":         1,
		"client_id": clientID,
	}
	data, _ := json.Marshal(hs)
	return writeFrame(conn, 0, data)
}

func writeFrame(conn net.Conn, opcode uint32, payload []byte) error {
	hdr := make([]byte, 8)
	binary.LittleEndian.PutUint32(hdr[0:4], opcode)
	binary.LittleEndian.PutUint32(hdr[4:8], uint32(len(payload)))
	if _, err := conn.Write(hdr); err != nil {
		return err
	}
	_, err := conn.Write(payload)
	return err
}
