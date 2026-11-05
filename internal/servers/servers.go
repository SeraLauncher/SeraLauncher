package servers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"serago/internal/instances"
)

// ServerEntry holds server connection details.
type ServerEntry struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	IP             string  `json:"ip"`
	Icon           *string `json:"icon"`
	AcceptTextures *int8   `json:"acceptTextures"`
}

// ServerPingResult contains information returned from Server List Ping.
type ServerPingResult struct {
	Motd          string  `json:"motd"`
	VersionName   string  `json:"versionName"`
	Protocol      int32   `json:"protocol"`
	PlayersOnline uint32  `json:"playersOnline"`
	PlayersMax    uint32  `json:"playersMax"`
	PingMs        uint64  `json:"pingMs"`
	Favicon       *string `json:"favicon"`
}

// GetServers reads servers.json from the instance folder.
// ponytail: JSON server list representation with fallback
func GetServers(instanceID string) ([]ServerEntry, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	p := filepath.Join(instDir, "minecraft", "servers.json")
	data, err := os.ReadFile(p)
	if err != nil {
		return []ServerEntry{}, nil
	}

	var list []ServerEntry
	if err := json.Unmarshal(data, &list); err != nil {
		return []ServerEntry{}, nil
	}
	return list, nil
}

// SaveServers writes servers to servers.json in the instance directory.
func SaveServers(instanceID string, entries []ServerEntry) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}

	p := filepath.Join(instDir, "minecraft", "servers.json")
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

// PingServer connects to a Minecraft server address and executes the Server List Ping handshake.
func PingServer(address string) (ServerPingResult, error) {
	host := address
	port := 25565

	if strings.Contains(address, ":") {
		parts := strings.Split(address, ":")
		host = parts[0]
		if p, err := strconv.Atoi(parts[1]); err == nil {
			port = p
		}
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 4*time.Second)
	if err != nil {
		return ServerPingResult{}, fmt.Errorf("failed to connect to %s: %w", address, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(4 * time.Second))

	// Send Handshake packet (packet ID: 0x00, NextState: 1 for status)
	var packet bytes.Buffer
	writeVarInt(&packet, 0x00) // Packet ID
	writeVarInt(&packet, 47)   // Protocol 47
	writeString(&packet, host)
	packet.WriteByte(byte(port >> 8))
	packet.WriteByte(byte(port))
	writeVarInt(&packet, 1) // Next state: Status

	writePacket(conn, packet.Bytes())

	// Send Status Request packet (packet ID: 0x00)
	var req bytes.Buffer
	writeVarInt(&req, 0x00)
	writePacket(conn, req.Bytes())

	// Read Status Response
	respLen, err := readVarInt(conn)
	if err != nil {
		return ServerPingResult{}, err
	}
	_ = respLen

	respID, err := readVarInt(conn)
	if err != nil || respID != 0x00 {
		return ServerPingResult{}, fmt.Errorf("unexpected packet id: %d", respID)
	}

	jsonStr, err := readString(conn)
	if err != nil {
		return ServerPingResult{}, err
	}

	pingMs := uint64(time.Since(start).Milliseconds())

	type rawSLP struct {
		Description any `json:"description"`
		Players     struct {
			Max    uint32 `json:"max"`
			Online uint32 `json:"online"`
		} `json:"players"`
		Version struct {
			Name     string `json:"name"`
			Protocol int32  `json:"protocol"`
		} `json:"version"`
		Favicon *string `json:"favicon"`
	}

	var slp rawSLP
	if err := json.Unmarshal([]byte(jsonStr), &slp); err != nil {
		return ServerPingResult{
			Motd:        "Minecraft Server",
			VersionName: "1.20",
			PingMs:      pingMs,
		}, nil
	}

	motd := extractMOTD(slp.Description)
	return ServerPingResult{
		Motd:          motd,
		VersionName:   slp.Version.Name,
		Protocol:      slp.Version.Protocol,
		PlayersOnline: slp.Players.Online,
		PlayersMax:    slp.Players.Max,
		PingMs:        pingMs,
		Favicon:       slp.Favicon,
	}, nil
}

func extractMOTD(desc any) string {
	switch v := desc.(type) {
	case string:
		return stripColorCodes(v)
	case map[string]any:
		if text, ok := v["text"].(string); ok {
			return stripColorCodes(text)
		}
	}
	return "Minecraft Server"
}

func stripColorCodes(s string) string {
	var b strings.Builder
	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		if runes[i] == '§' && i+1 < len(runes) {
			i++
			continue
		}
		b.WriteRune(runes[i])
	}
	return strings.TrimSpace(b.String())
}

func writeVarInt(buf *bytes.Buffer, val int) {
	for {
		if (val & ^0x7F) == 0 {
			buf.WriteByte(byte(val))
			return
		}
		buf.WriteByte(byte((val & 0x7F) | 0x80))
		val = int(uint(val) >> 7)
	}
}

func readVarInt(r io.Reader) (int, error) {
	var val int
	var position int
	b := make([]byte, 1)
	for {
		if _, err := r.Read(b); err != nil {
			return 0, err
		}
		current := b[0]
		val |= int(current&0x7F) << position
		if (current & 0x80) == 0 {
			break
		}
		position += 7
		if position >= 32 {
			return 0, fmt.Errorf("varint too big")
		}
	}
	return val, nil
}

func writeString(buf *bytes.Buffer, s string) {
	writeVarInt(buf, len(s))
	buf.WriteString(s)
}

func readString(r io.Reader) (string, error) {
	length, err := readVarInt(r)
	if err != nil {
		return "", err
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

func writePacket(w io.Writer, data []byte) {
	var lenBuf bytes.Buffer
	writeVarInt(&lenBuf, len(data))
	_, _ = w.Write(lenBuf.Bytes())
	_, _ = w.Write(data)
}
