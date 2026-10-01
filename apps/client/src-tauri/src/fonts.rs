/// Families installed on the user's machine, for the interface font picker.
///
/// Read through the platform's own font backend rather than by scanning font
/// directories, so a family the user can actually use is a family we list.
pub fn installed() -> Vec<String> {
    // a font source that will not open is a missing font list, not a crash
    let Ok(mut families) = font_kit::source::SystemSource::new().all_families() else {
        return Vec::new();
    };

    families.sort_by_key(|name| name.to_lowercase());
    collapse_aliases(&mut families);
    families
}

/// Drop names css would treat as the same family, keeping the capitalised spelling:
/// that is the one the platform writes in its own menus. Sorting by lowercase first
/// puts the aliases next to each other, which is what makes the pass linear.
fn collapse_aliases(families: &mut Vec<String>) {
    let mut kept: Vec<String> = Vec::with_capacity(families.len());
    for name in families.drain(..) {
        match kept.last_mut() {
            Some(last) if last.to_lowercase() == name.to_lowercase() => {
                if !last.chars().any(char::is_uppercase) && name.chars().any(char::is_uppercase) {
                    last.clone_from(&name);
                }
            }
            _ => kept.push(name),
        }
    }
    *families = kept;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_collapse_onto_one_capitalised_entry() {
        let mut families = vec![
            "noto sans".to_string(),
            "Fira Sans".into(),
            "Noto Sans".into(),
            "Arial".into(),
            "arial".into(),
        ];
        families.sort_by_key(|name| name.to_lowercase());

        collapse_aliases(&mut families);

        assert_eq!(families, ["Arial", "Fira Sans", "Noto Sans"]);
    }

    #[test]
    fn a_name_already_capitalised_survives() {
        let mut families = vec!["Noto Sans".to_string(), "noto sans".into()];
        families.sort_by_key(|name| name.to_lowercase());

        collapse_aliases(&mut families);

        assert_eq!(families, ["Noto Sans"]);
    }

    #[test]
    fn this_machine_reports_families() {
        // no assertion on the count, only that the backend answers at all
        let _ = installed();
    }
}
