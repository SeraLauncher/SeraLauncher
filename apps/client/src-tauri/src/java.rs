use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

/// Information about an installed Java runtime discovered on the host system.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntime {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub is_64_bit: bool,
}

/// Helper mapping Minecraft game versions to their required Java major runtime.
///
/// Compatibility reference:
/// - Minecraft <= 1.16.5: Java 8
/// - Minecraft 1.17 - 1.17.1: Java 16 (or 17)
/// - Minecraft 1.18 - 1.20.4: Java 17
/// - Minecraft 1.20.5+: Java 21
/// - Future snapshots (e.g. 26.x or newer): Java 21 or Java 25
pub fn required_java_version(mc_version: &str) -> u32 {
    let clean = mc_version.trim();

    // snapshot format like "26.4 Snapshot 2"
    if let Some(first_num) = clean
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .and_then(|s| s.parse::<u32>().ok())
    {
        if first_num >= 25 {
            return 21;
        }
    }

    // semver like "1.21.4"
    let parts: Vec<u32> = clean
        .split('.')
        .filter_map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok()
        })
        .collect();

    if parts.len() >= 2 && parts[0] == 1 {
        let minor = parts[1];
        let patch = parts.get(2).copied().unwrap_or(0);

        if minor >= 21 || (minor == 20 && patch >= 5) {
            return 21;
        }
        if minor >= 18 || (minor == 20 && patch < 5) {
            return 17;
        }
        if minor == 17 {
            return 16;
        }
        return 8;
    }

    21
}

/// Parses the major version number from a Java version string (e.g. "21.0.2", "1.8.0_382", "25-ea").
pub fn parse_major_version(ver_str: &str) -> u32 {
    let trimmed = ver_str.trim().trim_matches('"');
    if trimmed.starts_with("1.8") {
        return 8;
    }
    if trimmed.starts_with("1.7") {
        return 7;
    }
    if trimmed.starts_with("1.6") {
        return 6;
    }

    // take digits before the first dot, hyphen, or non-digit
    let digits: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u32>().unwrap_or(0)
}

/// Extracts the version number from `java -version` output lines.
/// Output format typically:
/// `openjdk version "21.0.2" 2024-01-16` or `java version "1.8.0_391"`
pub fn parse_version_output(output: &str) -> Option<(String, u32, bool)> {
    let mut version = None;
    let mut is_64_bit = false;

    for line in output.lines() {
        let lower = line.to_lowercase();
        if lower.contains("64-bit") || lower.contains("x86_64") || lower.contains("aarch64") {
            is_64_bit = true;
        }

        if version.is_none() && (lower.contains("version \"") || lower.contains("version '")) {
            if let Some(start) = line.find('"').or_else(|| line.find('\'')) {
                let rest = &line[start + 1..];
                if let Some(end) = rest.find('"').or_else(|| rest.find('\'')) {
                    let v = rest[..end].to_string();
                    version = Some(v);
                }
            }
        }
    }

    version.map(|ver| {
        let major = parse_major_version(&ver);
        (ver, major, is_64_bit)
    })
}

/// Inspects a java binary at `path` by invoking `-version` and parsing metadata.
pub fn inspect_java_binary(path: &Path) -> Option<JavaRuntime> {
    if !path.exists() || !path.is_file() {
        return None;
    }

    // java writes -version information to stderr across all major jdks
    let output = Command::new(path).arg("-version").output().ok()?;

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let (version, major_version, is_64_bit) = parse_version_output(&combined)?;
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    Some(JavaRuntime {
        path: canonical.to_string_lossy().to_string(),
        version,
        major_version,
        is_64_bit,
    })
}

/// Checks candidate search directories across operating systems.
fn candidate_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // 1. Check PATH env variable
    if let Some(path_env) = std::env::var_os("PATH") {
        for entry in std::env::split_paths(&path_env) {
            candidates.push(entry.join("java"));
            candidates.push(entry.join("javaw.exe"));
            candidates.push(entry.join("java.exe"));
        }
    }

    // 2. Check JAVA_HOME env variable
    if let Some(home) = std::env::var_os("JAVA_HOME") {
        let home_path = PathBuf::from(home);
        candidates.push(home_path.join("bin").join("java"));
        candidates.push(home_path.join("bin").join("javaw.exe"));
        candidates.push(home_path.join("bin").join("java.exe"));
    }

    // 3. Linux common paths
    #[cfg(target_os = "linux")]
    {
        let jvm_roots = [
            PathBuf::from("/usr/lib/jvm"),
            PathBuf::from("/usr/java"),
            PathBuf::from("/opt/java"),
            PathBuf::from("/opt/jdk"),
        ];

        for root in &jvm_roots {
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    candidates.push(p.join("bin").join("java"));
                    candidates.push(p.join("jre").join("bin").join("java"));
                }
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            let home_p = PathBuf::from(home);
            let user_roots = [
                home_p.join(".sdkman/candidates/java"),
                home_p.join(".asdf/installs/java"),
                home_p.join(".local/share/jvm"),
            ];
            for root in &user_roots {
                if let Ok(entries) = std::fs::read_dir(root) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("bin").join("java"));
                    }
                }
            }
        }
    }

    // 4. macOS common paths
    #[cfg(target_os = "macos")]
    {
        // /usr/libexec/java_home is the standard macos tool to query jdks
        if let Ok(output) = Command::new("/usr/libexec/java_home").arg("-V").output() {
            let err_out = String::from_utf8_lossy(&output.stderr);
            for line in err_out.lines() {
                if let Some(idx) = line.find('/') {
                    let jvm_home = line[idx..].trim();
                    candidates.push(PathBuf::from(jvm_home).join("bin").join("java"));
                }
            }
        }

        let mac_roots = [
            PathBuf::from("/Library/Java/JavaVirtualMachines"),
            PathBuf::from("/System/Library/Java/JavaVirtualMachines"),
        ];

        for root in &mac_roots {
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("Contents/Home/bin/java"));
                }
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            let user_jvm = PathBuf::from(home).join("Library/Java/JavaVirtualMachines");
            if let Ok(entries) = std::fs::read_dir(user_jvm) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("Contents/Home/bin/java"));
                }
            }
        }
    }

    // 5. Windows common paths
    #[cfg(target_os = "windows")]
    {
        let win_roots = [
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\BellSoft",
            r"C:\Program Files\Zulu",
            r"C:\Program Files (x86)\Java",
        ];

        for root_str in &win_roots {
            let root = PathBuf::from(root_str);
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    candidates.push(p.join("bin").join("javaw.exe"));
                    candidates.push(p.join("bin").join("java.exe"));
                }
            }
        }

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let adoptium = PathBuf::from(local_app_data).join("Programs").join("Eclipse Adoptium");
            if let Ok(entries) = std::fs::read_dir(adoptium) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("bin").join("javaw.exe"));
                }
            }
        }
    }

    candidates
}

/// Discovers installed Java runtimes on the machine, sorted by major version descending.
pub fn discover_java_runtimes() -> Vec<JavaRuntime> {
    let mut runtimes = Vec::new();
    let mut visited_paths = std::collections::HashSet::new();

    for path in candidate_paths() {
        if !path.exists() {
            continue;
        }

        if let Some(runtime) = inspect_java_binary(&path) {
            if visited_paths.insert(runtime.path.clone()) {
                runtimes.push(runtime);
            }
        }
    }

    // sort newest major version first, prefer 64-bit
    runtimes.sort_by(|a, b| {
        b.major_version
            .cmp(&a.major_version)
            .then_with(|| b.is_64_bit.cmp(&a.is_64_bit))
            .then_with(|| a.version.cmp(&b.version))
    });

    runtimes
}

/// Returns the host machine's total physical memory in megabytes (MB).
pub fn system_total_memory_mb() -> u32 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<u64>() {
                            return (kb / 1024) as u32;
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sysctl").arg("-n").arg("hw.memsize").output() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(bytes) = s.parse::<u64>() {
                return (bytes / (1024 * 1024)) as u32;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1024)",
            ])
            .output()
        {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(mb) = s.parse::<u32>() {
                return mb;
            }
        }
    }

    // standard 8GB fallback if platform queries are unavailable
    8192
}

/*
 * =========================================================================
 * Phase 4 TODO: Automatic Java Runtime Downloader Specification
 * =========================================================================
 *
 * When the user creates an instance in Phase 4:
 * 1. Determine instance Minecraft version and check `required_java_version(mc_version)`.
 * 2. Search `discover_java_runtimes()` for an installed runtime matching that major version.
 * 3. If no matching Java runtime is found:
 *    - Query Adoptium Temurin API:
 *      Endpoint: https://api.adoptium.net/v3/binary/latest/{feature_version}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse
 *      (where feature_version = 8 | 17 | 21 | 25, os = linux|mac|windows, arch = x64|aarch64)
 *    - Alternative: Mojang's official Java manifest:
 *      https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json
 *      which provides component runtimes (java-runtime-alpha for 16/17, java-runtime-gamma for 17,
 *      java-runtime-delta for 21, jre-legacy for 8).
 *    - Download archive into `~/.config/SeraLauncher/runtimes/java-{version}/`.
 *    - Extract archive, make binary executable (chmod +x on unix), and register path.
 * =========================================================================
 */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_java_versions_accurately() {
        assert_eq!(parse_major_version("21.0.2"), 21);
        assert_eq!(parse_major_version("22.0.2"), 22);
        assert_eq!(parse_major_version("17.0.10"), 17);
        assert_eq!(parse_major_version("1.8.0_391"), 8);
        assert_eq!(parse_major_version("25-ea"), 25);
    }

    #[test]
    fn parses_version_command_output() {
        let sample = r#"openjdk version "21.0.2" 2024-01-16
OpenJDK Runtime Environment (build 21.0.2+13)
OpenJDK 64-Bit Server VM (build 21.0.2+13, mixed mode, sharing)"#;

        let parsed = parse_version_output(sample).unwrap();
        assert_eq!(parsed.0, "21.0.2");
        assert_eq!(parsed.1, 21);
        assert!(parsed.2);
    }

    #[test]
    fn maps_minecraft_version_to_java_requirement() {
        assert_eq!(required_java_version("1.16.5"), 8);
        assert_eq!(required_java_version("1.12.2"), 8);
        assert_eq!(required_java_version("1.17"), 16);
        assert_eq!(required_java_version("1.17.1"), 16);
        assert_eq!(required_java_version("1.18.2"), 17);
        assert_eq!(required_java_version("1.20.1"), 17);
        assert_eq!(required_java_version("1.20.4"), 17);
        assert_eq!(required_java_version("1.20.5"), 21);
        assert_eq!(required_java_version("1.21"), 21);
        assert_eq!(required_java_version("1.21.4"), 21);
        assert_eq!(required_java_version("26.4 Snapshot 2"), 21);
    }

    #[test]
    fn discovers_at_least_one_system_java_on_host() {
        let runtimes = discover_java_runtimes();
        // this machine has java 17 and java 22 installed
        assert!(!runtimes.is_empty(), "expected host java runtimes to be discovered");
        assert!(runtimes[0].major_version >= 17);
    }

    #[test]
    fn reports_positive_system_memory() {
        let mem = system_total_memory_mb();
        assert!(mem >= 1024, "expected at least 1GB total memory, got {mem} MB");
    }
}
