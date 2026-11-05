package visuals

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"serago/internal/instances"
)

// GetActiveResourcePacks reads resourcePacks from options.txt.
func GetActiveResourcePacks(instanceID string) ([]string, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	optFile := filepath.Join(instDir, "minecraft", "options.txt")
	file, err := os.Open(optFile)
	if err != nil {
		return []string{}, nil
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "resourcePacks:") {
			raw := strings.TrimPrefix(line, "resourcePacks:")
			var packs []string
			if err := json.Unmarshal([]byte(raw), &packs); err == nil {
				return packs, nil
			}
		}
	}
	return []string{}, nil
}

// SetActiveResourcePacks updates resourcePacks in options.txt.
func SetActiveResourcePacks(instanceID string, packs []string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}

	optFile := filepath.Join(instDir, "minecraft", "options.txt")
	var lines []string
	found := false

	data, _ := json.Marshal(packs)
	newEntry := "resourcePacks:" + string(data)

	if file, err := os.Open(optFile); err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "resourcePacks:") {
				lines = append(lines, newEntry)
				found = true
			} else {
				lines = append(lines, line)
			}
		}
		file.Close()
	}

	if !found {
		lines = append(lines, newEntry)
	}

	return os.WriteFile(optFile, []byte(strings.Join(lines, "\n")+"\n"), 0644)
}

// GetActiveShaderPack reads shaderPack from optionsshaders.txt.
func GetActiveShaderPack(instanceID string) (*string, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return nil, err
	}

	p := filepath.Join(instDir, "minecraft", "optionsshaders.txt")
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, nil
	}

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "shaderPack=") {
			v := strings.TrimPrefix(line, "shaderPack=")
			v = strings.TrimSpace(v)
			if v != "" && v != "OFF" {
				return &v, nil
			}
			return nil, nil
		}
	}
	return nil, nil
}

// SetActiveShaderPack writes shaderPack to optionsshaders.txt.
func SetActiveShaderPack(instanceID string, shader *string) error {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return err
	}

	val := "OFF"
	if shader != nil && *shader != "" {
		val = *shader
	}

	p := filepath.Join(instDir, "minecraft", "optionsshaders.txt")
	entry := "shaderPack=" + val
	return os.WriteFile(p, []byte(entry+"\n"), 0644)
}
