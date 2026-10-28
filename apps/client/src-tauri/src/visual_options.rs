use std::path::PathBuf;

/// Returns the path to `<instance>/minecraft/options.txt`
fn get_options_txt_path(app: &tauri::AppHandle, instance_id: &str) -> Result<PathBuf, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    Ok(mc_dir.join("options.txt"))
}

/// Returns the path to `<instance>/minecraft/optionsshaders.txt`
fn get_options_shaders_path(app: &tauri::AppHandle, instance_id: &str) -> Result<PathBuf, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    Ok(mc_dir.join("optionsshaders.txt"))
}

/// Parses the active resource packs list from an options.txt string
pub fn parse_active_resource_packs_content(content: &str) -> Vec<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("resourcePacks:") {
            let json_part = trimmed.trim_start_matches("resourcePacks:").trim();
            if let Ok(entries) = serde_json::from_str::<Vec<String>>(json_part) {
                return entries
                    .into_iter()
                    .filter_map(|entry| {
                        if entry.eq_ignore_ascii_case("vanilla") {
                            None
                        } else if entry.starts_with("file/") {
                            Some(entry[5..].to_string())
                        } else {
                            Some(entry)
                        }
                    })
                    .collect();
            }
        }
    }
    Vec::new()
}

/// Updates the resourcePacks:[...] entry in options.txt while preserving all other configuration lines
pub fn update_resource_packs_content(existing_content: &str, active_packs: &[String]) -> String {
    let mut pack_entries = vec!["vanilla".to_string()];
    for pack in active_packs {
        let trimmed = pack.trim();
        if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case("vanilla") {
            let entry = if trimmed.starts_with("file/") {
                trimmed.to_string()
            } else {
                format!("file/{}", trimmed)
            };
            pack_entries.push(entry);
        }
    }

    let json_array =
        serde_json::to_string(&pack_entries).unwrap_or_else(|_| "[\"vanilla\"]".to_string());
    let new_line = format!("resourcePacks:{}", json_array);

    let mut lines = Vec::new();
    let mut found = false;

    for line in existing_content.lines() {
        if line.trim().starts_with("resourcePacks:") {
            lines.push(new_line.clone());
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !found {
        lines.push(new_line);
    }

    let mut result = lines.join("\n");
    if existing_content.ends_with('\n') {
        result.push('\n');
    }
    result
}

/// Reads options.txt and returns active resource packs in order of priority
pub fn get_active_resource_packs(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<Vec<String>, String> {
    let path = get_options_txt_path(app, instance_id)?;
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read options.txt: {}", e))?;
    Ok(parse_active_resource_packs_content(&content))
}

/// Writes active resource packs list into options.txt
pub fn set_active_resource_packs(
    app: &tauri::AppHandle,
    instance_id: &str,
    active_packs: Vec<String>,
) -> Result<(), String> {
    let path = get_options_txt_path(app, instance_id)?;
    let existing_content = if path.is_file() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };

    let updated_content = update_resource_packs_content(&existing_content, &active_packs);
    std::fs::write(&path, updated_content)
        .map_err(|e| format!("Failed to write options.txt: {}", e))?;
    Ok(())
}

/// Reads optionsshaders.txt and parses the active shader pack name
pub fn get_active_shader_pack(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<Option<String>, String> {
    let path = get_options_shaders_path(app, instance_id)?;
    if !path.is_file() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read optionsshaders.txt: {}", e))?;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("shaderPack=") {
            let val = trimmed.trim_start_matches("shaderPack=").trim();
            if val.is_empty()
                || val.eq_ignore_ascii_case("off")
                || val.eq_ignore_ascii_case("(internal)")
            {
                return Ok(None);
            } else {
                return Ok(Some(val.to_string()));
            }
        }
    }

    Ok(None)
}

/// Updates optionsshaders.txt with the chosen shader pack (or disables shaders)
pub fn set_active_shader_pack(
    app: &tauri::AppHandle,
    instance_id: &str,
    shader_pack: Option<String>,
) -> Result<(), String> {
    let path = get_options_shaders_path(app, instance_id)?;
    let existing_content = if path.is_file() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };

    let (shader_val, enabled_val) = match &shader_pack {
        Some(name) if !name.trim().is_empty() && !name.eq_ignore_ascii_case("off") => {
            (name.trim().to_string(), "true")
        }
        _ => ("OFF".to_string(), "false"),
    };

    let mut lines = Vec::new();
    let mut found_pack = false;
    let mut found_enabled = false;

    for line in existing_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("shaderPack=") {
            lines.push(format!("shaderPack={}", shader_val));
            found_pack = true;
        } else if trimmed.starts_with("enabled=") {
            lines.push(format!("enabled={}", enabled_val));
            found_enabled = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !found_pack {
        lines.push(format!("shaderPack={}", shader_val));
    }
    if !found_enabled {
        lines.push(format!("enabled={}", enabled_val));
    }

    let result = lines.join("\n") + "\n";
    std::fs::write(&path, result)
        .map_err(|e| format!("Failed to write optionsshaders.txt: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_resource_packs_from_options_txt() {
        let content = "version:3465\nguiScale:2\nresourcePacks:[\"vanilla\",\"file/Bare Bones.zip\",\"file/Faithful 32x.zip\"]\nfullscreen:true\n";
        let packs = parse_active_resource_packs_content(content);
        assert_eq!(packs, vec!["Bare Bones.zip", "Faithful 32x.zip"]);
    }

    #[test]
    fn updates_resource_packs_and_preserves_other_options() {
        let original = "version:3465\nguiScale:2\nresourcePacks:[\"vanilla\",\"file/Old.zip\"]\nfullscreen:true\n";
        let new_packs = vec!["NewPack.zip".to_string(), "Bare Bones.zip".to_string()];
        let updated = update_resource_packs_content(original, &new_packs);

        assert!(updated.contains("version:3465"));
        assert!(updated.contains("guiScale:2"));
        assert!(updated.contains("fullscreen:true"));
        assert!(updated
            .contains("resourcePacks:[\"vanilla\",\"file/NewPack.zip\",\"file/Bare Bones.zip\"]"));
        assert!(!updated.contains("file/Old.zip"));
    }
}
