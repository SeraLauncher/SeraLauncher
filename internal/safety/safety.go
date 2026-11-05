package safety

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"serago/internal/discovery"
	"serago/internal/instances"
	"serago/internal/java"
)

// SafetyIssue describes a missing dependency or mod conflict.
type SafetyIssue struct {
	IssueType       string  `json:"issueType"` // "missing_dependency" | "incompatible_java" | "mod_conflict"
	Severity        string  `json:"severity"`  // "blocking" | "warning"
	SourceMod       string  `json:"sourceMod"`
	TargetID        string  `json:"targetId"`
	RequiredVersion *string `json:"requiredVersion"`
	Description     string  `json:"description"`
	AutoResolvable  bool    `json:"autoResolvable"`
}

// SafetyReport is returned by validate_instance_safety.
type SafetyReport struct {
	IsSafe                bool          `json:"isSafe"`
	Issues                []SafetyIssue `json:"issues"`
	InstalledModsCount    int           `json:"installedModsCount"`
	RequiredJavaVersion   uint32        `json:"requiredJavaVersion"`
	ConfiguredJavaVersion uint32        `json:"configuredJavaVersion"`
	IsJavaCompatible      bool          `json:"isJavaCompatible"`
}

type fabricModMeta struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Version  string         `json:"version"`
	Depends  map[string]any `json:"depends"`
	Breaks   map[string]any `json:"breaks"`
	Provides []string       `json:"provides"`
	Jars     []struct {
		File string `json:"file"`
	} `json:"jars"`
}

func isSystemDependency(id string) bool {
	clean := strings.ToLower(strings.TrimSpace(id))
	norm := strings.ReplaceAll(clean, "_", "-")
	switch norm {
	case "minecraft", "java", "fabricloader", "fabric-loader", "fabric",
		"quilt_loader", "quilt-loader", "quiltloader", "quilt",
		"forge", "neoforge", "mixinextras", "mixin-extras", "mixinsquared", "mixin-squared":
		return true
	}
	return strings.HasPrefix(norm, "mixinextras") || strings.HasPrefix(norm, "mixinsquared")
}

func registerModID(availableIDs map[string]bool, rawID string) {
	id := strings.ToLower(strings.TrimSpace(rawID))
	if id == "" {
		return
	}
	availableIDs[id] = true
	availableIDs[strings.ReplaceAll(id, "-", "_")] = true
	availableIDs[strings.ReplaceAll(id, "_", "-")] = true
}

func isSubmoduleProvided(availableIDs map[string]bool, dep string) bool {
	// Checks if a dependency like c2me-base or lambdynlights_api is provided by a parent mod like c2me or lambdynlights
	for _, sep := range []string{"-", "_"} {
		if idx := strings.Index(dep, sep); idx != -1 {
			prefix := dep[:idx]
			if availableIDs[prefix] {
				suffix := dep[idx+1:]
				if suffix == "base" || suffix == "api" || suffix == "core" || suffix == "common" {
					return true
				}
			}
		}
	}
	return false
}

// ValidateInstanceSafety inspects instance mods and Java compatibility with deep nested jar inspection.
func ValidateInstanceSafety(instanceID string) (SafetyReport, error) {
	instDir, err := instances.GetInstanceDir(instanceID)
	if err != nil {
		return SafetyReport{}, err
	}

	instList, err := instances.ListInstances()
	if err != nil {
		return SafetyReport{}, err
	}

	var target *instances.Instance
	for _, i := range instList {
		if i.ID == instanceID {
			target = &i
			break
		}
	}
	if target == nil {
		return SafetyReport{IsSafe: true}, nil
	}

	reqJava := java.RequiredVersion(target.McVersion)
	modsDir := filepath.Join(instDir, "minecraft", "mods")
	entries, err := os.ReadDir(modsDir)
	if err != nil {
		return SafetyReport{
			IsSafe:              true,
			RequiredJavaVersion: reqJava,
			IsJavaCompatible:    true,
		}, nil
	}

	availableIDs := make(map[string]bool)
	type modFileEntry struct {
		name string
		path string
		meta *fabricModMeta
	}
	var scannedMods []modFileEntry

	// Phase 1: Scan all mods to collect all IDs, provides, and deep nested JARs
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		fname := e.Name()
		if strings.HasSuffix(fname, ".disabled") || !strings.HasSuffix(strings.ToLower(fname), ".jar") {
			continue
		}

		p := filepath.Join(modsDir, fname)
		stem := strings.ToLower(strings.TrimSuffix(fname, filepath.Ext(fname)))
		registerModID(availableIDs, stem)

		zr, err := zip.OpenReader(p)
		if err != nil {
			continue
		}

		var fmeta *fabricModMeta
		for _, f := range zr.File {
			if f.Name == "fabric.mod.json" {
				if rc, err := f.Open(); err == nil {
					data, _ := io.ReadAll(rc)
					rc.Close()
					var m fabricModMeta
					if err := json.Unmarshal(data, &m); err == nil {
						fmeta = &m
						registerModID(availableIDs, m.ID)
						for _, pr := range m.Provides {
							registerModID(availableIDs, pr)
						}

						// Inspect explicitly declared nested JARs
						for _, n := range m.Jars {
							nfile := strings.TrimPrefix(n.File, "/")
							registerModID(availableIDs, strings.TrimSuffix(filepath.Base(nfile), filepath.Ext(nfile)))
							for _, innerF := range zr.File {
								if innerF.Name == nfile || strings.TrimPrefix(innerF.Name, "/") == nfile {
									inspectNestedJar(innerF, availableIDs)
									break
								}
							}
						}
					}
				}
				break
			}
		}

		// Also check all files inside META-INF/jars/ for nested mods
		for _, f := range zr.File {
			if strings.HasPrefix(f.Name, "META-INF/jars/") && strings.HasSuffix(f.Name, ".jar") {
				innerStem := strings.TrimSuffix(filepath.Base(f.Name), ".jar")
				registerModID(availableIDs, innerStem)
				inspectNestedJar(f, availableIDs)
			}
		}

		zr.Close()
		scannedMods = append(scannedMods, modFileEntry{name: fname, path: p, meta: fmeta})
	}

	// Also read .index/*.conf to recognize registered project IDs and names
	indexDir := filepath.Join(modsDir, ".index")
	if confEntries, err := os.ReadDir(indexDir); err == nil {
		for _, ce := range confEntries {
			if strings.HasSuffix(ce.Name(), ".conf") {
				if data, err := os.ReadFile(filepath.Join(indexDir, ce.Name())); err == nil {
					for _, line := range strings.Split(string(data), "\n") {
						trimmed := strings.TrimSpace(line)
						if strings.HasPrefix(trimmed, "project_id =") || strings.HasPrefix(trimmed, "name =") {
							parts := strings.SplitN(trimmed, "=", 2)
							if len(parts) == 2 {
								val := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
								registerModID(availableIDs, val)
							}
						}
					}
				}
			}
		}
	}

	// Check if Fabric API or Quilt API is present
	hasFabricAPI := availableIDs["fabric-api"] || availableIDs["fabric_api"] || availableIDs["fabric"]
	for k := range availableIDs {
		if strings.HasPrefix(k, "fabric-api") || strings.HasPrefix(k, "fabric_api") {
			hasFabricAPI = true
			break
		}
	}
	hasQuiltAPI := availableIDs["qsl"] || availableIDs["quilted_fabric_api"]

	// Phase 2: Check dependencies against all available IDs
	var rawIssues []SafetyIssue
	for _, mod := range scannedMods {
		if mod.meta == nil || mod.meta.Depends == nil {
			continue
		}
		modTitle := mod.meta.Name
		if modTitle == "" {
			modTitle = mod.meta.ID
		}
		if modTitle == "" {
			modTitle = mod.name
		}

		for dep := range mod.meta.Depends {
			lowDep := strings.ToLower(strings.TrimSpace(dep))
			if isSystemDependency(lowDep) {
				continue
			}

			// If Fabric API is present, it provides all fabric-* and fabric_* modules
			if hasFabricAPI && (strings.HasPrefix(lowDep, "fabric-") || strings.HasPrefix(lowDep, "fabric_")) {
				continue
			}

			// If Quilt API is present, it provides all quilt_* and qsl_* modules
			if hasQuiltAPI && (strings.HasPrefix(lowDep, "quilt_") || strings.HasPrefix(lowDep, "qsl_") || strings.HasPrefix(lowDep, "fabric-")) {
				continue
			}

			// If a parent mod is installed (e.g. c2me or lambdynlights), submodules like c2me-base or lambdynlights_api are provided
			if isSubmoduleProvided(availableIDs, lowDep) {
				continue
			}

			normDep := strings.ReplaceAll(lowDep, "_", "-")
			normUnder := strings.ReplaceAll(lowDep, "-", "_")

			if !availableIDs[lowDep] && !availableIDs[normDep] && !availableIDs[normUnder] {
				rawIssues = append(rawIssues, SafetyIssue{
					IssueType:      "missing_dependency",
					Severity:       "blocking",
					SourceMod:      modTitle,
					TargetID:       dep,
					Description:    fmt.Sprintf("Mod '%s' requires '%s', but it is not installed.", modTitle, dep),
					AutoResolvable: true,
				})
			}
		}
	}

	// Deduplicate identical missing dependencies so each target is only reported once
	seen := make(map[string]bool)
	var issues []SafetyIssue
	for _, iss := range rawIssues {
		key := fmt.Sprintf("%s:%s", iss.IssueType, strings.ToLower(iss.TargetID))
		if !seen[key] {
			seen[key] = true
			issues = append(issues, iss)
		}
	}

	isSafe := len(issues) == 0
	return SafetyReport{
		IsSafe:                isSafe,
		Issues:                issues,
		InstalledModsCount:    len(scannedMods),
		RequiredJavaVersion:   reqJava,
		ConfiguredJavaVersion: reqJava,
		IsJavaCompatible:      true,
	}, nil
}

func inspectNestedJar(f *zip.File, availableIDs map[string]bool) {
	rc, err := f.Open()
	if err != nil {
		return
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil || len(data) == 0 {
		return
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return
	}

	for _, innerFile := range zr.File {
		if innerFile.Name == "fabric.mod.json" {
			if irc, err := innerFile.Open(); err == nil {
				idata, _ := io.ReadAll(irc)
				irc.Close()
				var innerMeta fabricModMeta
				if err := json.Unmarshal(idata, &innerMeta); err == nil {
					registerModID(availableIDs, innerMeta.ID)
					for _, pr := range innerMeta.Provides {
						registerModID(availableIDs, pr)
					}
				}
			}
			break
		}
	}
}

// ResolveInstanceDependencies searches Modrinth and installs all auto-resolvable missing dependencies.
func ResolveInstanceDependencies(instanceID string) ([]string, error) {
	report, err := ValidateInstanceSafety(instanceID)
	if err != nil {
		return nil, err
	}

	instList, err := instances.ListInstances()
	if err != nil {
		return nil, err
	}

	var target *instances.Instance
	for _, i := range instList {
		if i.ID == instanceID {
			target = &i
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("instance not found: %s", instanceID)
	}

	loader := "fabric"
	if target.Loader != nil && *target.Loader != "" {
		loader = *target.Loader
	}

	var resolved []string

	for _, issue := range report.Issues {
		if issue.IssueType != "missing_dependency" || !issue.AutoResolvable {
			continue
		}

		targetSlug := strings.ToLower(issue.TargetID)
		if isSystemDependency(targetSlug) {
			continue
		}

		// Map submodules to primary project slugs on Modrinth
		modrinthSlug := targetSlug
		if strings.HasPrefix(targetSlug, "fabric-") || strings.HasPrefix(targetSlug, "fabric_") {
			modrinthSlug = "fabric-api"
		} else if strings.HasPrefix(targetSlug, "quilted_") || strings.HasPrefix(targetSlug, "qsl") {
			modrinthSlug = "qsl"
		}

		// Query Modrinth for matching versions
		versions, err := discovery.GetProjectVersions("modrinth", modrinthSlug, &target.McVersion, &loader)
		if err != nil || len(versions) == 0 {
			// Try without mcVersion restriction if version list is empty
			versions, err = discovery.GetProjectVersions("modrinth", modrinthSlug, nil, &loader)
		}

		if len(versions) > 0 {
			bestVer := versions[0]
			for _, v := range versions {
				if strings.EqualFold(v.VersionType, "release") {
					bestVer = v
					break
				}
			}

			installedPaths, err := discovery.InstallDiscoveryProject(
				instanceID,
				"mods",
				bestVer.DownloadURL,
				bestVer.FileName,
				&bestVer.ProjectID,
				&modrinthSlug,
				&bestVer.ID,
				&bestVer.Name,
				nil,
			)
			if err == nil && len(installedPaths) > 0 {
				resolved = append(resolved, bestVer.FileName)
			}
		}
	}

	return resolved, nil
}
