// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Disables GTK native overlay scrollbars so WebKitGTK renders CSS scrollbars cleanly
        std::env::set_var("GTK_OVERLAY_SCROLLING", "0");
    }
    sera_launcher_lib::run()
}
