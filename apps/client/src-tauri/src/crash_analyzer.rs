use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashAnalysis {
    pub has_crashed: bool,
    pub title: String,
    pub cause_category: String, // "out_of_memory" | "missing_dependency" | "incompatible_java" | "native_library" | "mod_conflict" | "corrupt_jar" | "general"
    pub summary: String,
    pub suspected_mods: Vec<String>,
    pub suggested_fix: String,
    pub technical_details: Option<String>,
    pub crash_report_file: Option<String>,
    pub timestamp: Option<String>,
}

/// Scans crash reports, session logs, and latest.log of an instance to extract
/// the root cause of game crashes and provide clear, actionable fixes.
pub fn analyze_crash_logs(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<CrashAnalysis, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    // 1. Check for newest crash-report in minecraft/crash-reports
    let crash_reports_dir = mc_dir.join("crash-reports");
    let mut newest_crash_file: Option<(PathBuf, std::time::SystemTime)> = None;

    if crash_reports_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&crash_reports_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("txt") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if newest_crash_file.as_ref().map_or(true, |(_, t)| modified > *t) {
                                newest_crash_file = Some((path, modified));
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Collect content: crash-report (if recent) or latest session-log
    let mut log_content = String::new();
    let mut crash_file_name = None;
    let mut crash_timestamp = None;

    if let Some((crash_path, modified)) = newest_crash_file {
        if let Ok(content) = std::fs::read_to_string(&crash_path) {
            crash_file_name = crash_path.file_name().and_then(|f| f.to_str()).map(|s| s.to_string());
            if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                crash_timestamp = Some(dur.as_secs().to_string());
            }
            log_content = content;
        }
    }

    // If no crash report or log content is small, inspect the newest session log
    if log_content.is_empty() {
        let session_logs_dir = inst_dir.join("session-logs");
        let mut newest_session_file: Option<(PathBuf, std::time::SystemTime)> = None;
        if session_logs_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&session_logs_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("log") {
                        if let Ok(meta) = entry.metadata() {
                            if let Ok(modified) = meta.modified() {
                                if newest_session_file.as_ref().map_or(true, |(_, t)| modified > *t) {
                                    newest_session_file = Some((path, modified));
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some((session_path, _)) = newest_session_file {
            if let Ok(content) = std::fs::read_to_string(&session_path) {
                log_content = content;
            }
        } else {
            // Fallback to minecraft/logs/latest.log
            let latest_log = mc_dir.join("logs").join("latest.log");
            if latest_log.exists() {
                if let Ok(content) = std::fs::read_to_string(&latest_log) {
                    log_content = content;
                }
            }
        }
    }

    if log_content.trim().is_empty() {
        return Ok(CrashAnalysis {
            has_crashed: false,
            title: "No Crash Detected".to_string(),
            cause_category: "none".to_string(),
            summary: "No crash reports or errors were found for this instance.".to_string(),
            suspected_mods: Vec::new(),
            suggested_fix: "Everything looks normal. You can launch the instance when ready.".to_string(),
            technical_details: None,
            crash_report_file: None,
            timestamp: None,
        });
    }

    // 3. Pattern Detection & Diagnostics
    let text = log_content.as_str();

    // A. Out of Memory
    if text.contains("OutOfMemoryError") || text.contains("Java heap space") || text.contains("GC overhead limit exceeded") {
        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Out of Memory (Heap Space Exhausted)".to_string(),
            cause_category: "out_of_memory".to_string(),
            summary: "Minecraft ran out of allocated RAM and crashed because the Java Virtual Machine could not allocate more memory.".to_string(),
            suspected_mods: Vec::new(),
            suggested_fix: "Go to Instance Settings and increase Maximum Memory allocation (e.g. 4096 MB or higher).".to_string(),
            technical_details: extract_snippet(text, "OutOfMemoryError", 12),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // B. Missing Mod Dependency
    if text.contains("ModResolutionException")
        || text.contains("Incompatible mods found!")
        || text.contains("MissingModsException")
        || text.contains("HARD_DEP_NO_CANDIDATE")
        || text.contains("requires osl")
        || text.contains("requires fabric")
    {
        let mut suspected = Vec::new();
        let mut missing_item = "a required dependency";

        for line in text.lines() {
            let lower = line.to_lowercase();
            if lower.contains("requires") || lower.contains("depends") || lower.contains("hard_dep_no_candidate") {
                if let Some(mod_name) = extract_mod_name(line) {
                    if !suspected.contains(&mod_name) {
                        suspected.push(mod_name.clone());
                    }
                }
            }
        }

        if text.contains("fabric-api") || text.contains("legacy-fabric-api") || text.contains("requires osl") {
            missing_item = "Fabric API / Legacy Fabric API";
            if !suspected.contains(&"Fabric API".to_string()) {
                suspected.push("Fabric API".to_string());
            }
        }

        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Missing Mod Dependency".to_string(),
            cause_category: "missing_dependency".to_string(),
            summary: format!("One or more installed mods require {} to run, but it is not installed.", missing_item),
            suspected_mods: suspected,
            suggested_fix: "Go to the Mods tab and install the required library or dependency mod.".to_string(),
            technical_details: extract_snippet(text, "ModResolutionException", 15)
                .or_else(|| extract_snippet(text, "Incompatible mods found", 15)),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // C. Incompatible Java Version
    if text.contains("UnsupportedClassVersionError") || text.contains("has been compiled by a more recent version") {
        let req_ver = if text.contains("class file version 65") {
            "Java 21"
        } else if text.contains("class file version 61") {
            "Java 17"
        } else if text.contains("class file version 60") {
            "Java 16"
        } else if text.contains("class file version 52") {
            "Java 8"
        } else {
            "a newer Java version"
        };

        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Incompatible Java Version".to_string(),
            cause_category: "incompatible_java".to_string(),
            summary: format!("A mod or Minecraft binary was compiled for {}, but a different Java runtime was selected.", req_ver),
            suspected_mods: Vec::new(),
            suggested_fix: format!("Go to Instance Settings > Java & Run and switch the Java runtime to {}.", req_ver),
            technical_details: extract_snippet(text, "UnsupportedClassVersionError", 10),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // D. Corrupt Mod JAR / Zip Archive
    if text.contains("ZipException: error in opening zip file") || text.contains("invalid CEN header") || text.contains("Error analyzing") {
        let culprit = extract_jar_filename(text);
        let mut suspected = Vec::new();
        if let Some(ref c) = culprit {
            suspected.push(c.clone());
        }

        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Corrupted Mod JAR File".to_string(),
            cause_category: "corrupt_jar".to_string(),
            summary: format!(
                "The mod file {} is corrupted or incomplete and cannot be opened as a valid ZIP archive.",
                culprit.as_deref().unwrap_or("in the mods folder")
            ),
            suspected_mods: suspected,
            suggested_fix: "Delete the corrupt mod file in the Mods tab and reinstall it from Discovery.".to_string(),
            technical_details: extract_snippet(text, "ZipException", 10),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // E. Native Library / Graphics Driver Failure
    if text.contains("UnsatisfiedLinkError: no lwjgl")
        || text.contains("libawt.so")
        || text.contains("GLFW error 65542")
        || text.contains("Pixel format not accelerated")
    {
        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Graphics Driver or Native Library Failure".to_string(),
            cause_category: "native_library".to_string(),
            summary: "Minecraft failed to initialize the display window or load OpenGL/LWJGL native graphics libraries.".to_string(),
            suspected_mods: Vec::new(),
            suggested_fix: "Ensure your graphics drivers (Mesa / Vulkan) are up to date and that system libraries are installed.".to_string(),
            technical_details: extract_snippet(text, "UnsatisfiedLinkError", 10)
                .or_else(|| extract_snippet(text, "GLFW error", 10)),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // F. Mixin Conflict or Incompatible Mod Combination
    if text.contains("MixinTransformerError") || text.contains("MixinApplyError") || text.contains("DuplicateModsFoundException") {
        let culprit = extract_culprit_mod_from_mixin(text);
        let mut suspected = Vec::new();
        if let Some(c) = culprit {
            suspected.push(c);
        }

        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Mod Mixin Conflict".to_string(),
            cause_category: "mod_conflict".to_string(),
            summary: "Two or more mods are trying to modify the same internal game code and conflict with each other.".to_string(),
            suspected_mods: suspected,
            suggested_fix: "Try disabling the suspected mod or conflicting optimization mods in the Mods tab.".to_string(),
            technical_details: extract_snippet(text, "Mixin", 14),
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    // G. General Unhandled Exception
    if text.contains("Minecraft Crash Report") || text.contains("Minecraft has crashed!") || text.contains("FATAL") || text.contains("Exception in thread") {
        let first_err = extract_snippet(text, "Exception", 12)
            .or_else(|| extract_snippet(text, "ERROR", 10))
            .or_else(|| extract_snippet(text, "Description:", 12));

        return Ok(CrashAnalysis {
            has_crashed: true,
            title: "Unexpected Game Crash".to_string(),
            cause_category: "general".to_string(),
            summary: "Minecraft terminated unexpectedly with an unhandled exception.".to_string(),
            suspected_mods: Vec::new(),
            suggested_fix: "Review the log output or click 'View Crash Report' to inspect the full stack trace.".to_string(),
            technical_details: first_err,
            crash_report_file: crash_file_name,
            timestamp: crash_timestamp,
        });
    }

    Ok(CrashAnalysis {
        has_crashed: false,
        title: "No Crash Detected".to_string(),
        cause_category: "none".to_string(),
        summary: "No crash errors were detected in the latest session logs.".to_string(),
        suspected_mods: Vec::new(),
        suggested_fix: "The instance closed normally.".to_string(),
        technical_details: None,
        crash_report_file: None,
        timestamp: None,
    })
}

fn extract_snippet(content: &str, needle: &str, line_count: usize) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    for (idx, line) in lines.iter().enumerate() {
        if line.contains(needle) {
            let start = idx.saturating_sub(1);
            let end = (idx + line_count).min(lines.len());
            return Some(lines[start..end].join("\n"));
        }
    }
    None
}

fn extract_mod_name(line: &str) -> Option<String> {
    if let Some(start) = line.find('{') {
        if let Some(end) = line.find('}') {
            let inner = &line[start + 1..end];
            if inner.starts_with("depends ") {
                let parts: Vec<&str> = inner["depends ".len()..].split_whitespace().collect();
                if let Some(p) = parts.first() {
                    return Some(p.to_string());
                }
            }
        }
    }
    if line.contains("requires ") {
        if let Some(part) = line.split("requires ").nth(1) {
            let mod_id = part.split_whitespace().next()?.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
            if !mod_id.is_empty() {
                return Some(mod_id.to_string());
            }
        }
    }
    None
}

fn extract_jar_filename(content: &str) -> Option<String> {
    for line in content.lines() {
        if line.contains(".jar") {
            for word in line.split(|c: char| c.is_whitespace() || c == '[' || c == ']' || c == '(' || c == ')') {
                if word.ends_with(".jar") {
                    let path = Path::new(word);
                    if let Some(name) = path.file_name().and_then(|f| f.to_str()) {
                        return Some(name.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_culprit_mod_from_mixin(content: &str) -> Option<String> {
    for line in content.lines() {
        if line.contains("in classmap") || line.contains("into target") || line.contains("Mixin") {
            if let Some(part) = line.split("from mod ").nth(1) {
                let mod_name = part.split_whitespace().next()?.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
                if !mod_name.is_empty() {
                    return Some(mod_name.to_string());
                }
            }
        }
    }
    None
}
