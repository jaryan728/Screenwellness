use tauri::{
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_sql::{Migration, MigrationKind};

mod power_monitor;

// ── idle detection (Windows) ──────────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod idle_win {
    use std::mem;

    #[repr(C)]
    struct LASTINPUTINFO {
        cbSize: u32,
        dwTime: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }

    pub fn idle_seconds() -> u64 {
        unsafe {
            let mut lii = LASTINPUTINFO {
                cbSize: mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut lii) != 0 {
                let now = GetTickCount();
                return u64::from(now.wrapping_sub(lii.dwTime)) / 1000;
            }
        }
        0
    }
}

// ── commands ──────────────────────────────────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_active_window() -> String {
    match active_win_pos_rs::get_active_window() {
        Ok(w) => w.app_name,
        Err(_) => "Unknown".to_string(),
    }
}

#[tauri::command]
fn send_notification(_app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        // escape single quotes for PowerShell single-quoted strings
        let t = title.replace('\'', "''");
        let b = body.replace('\'', "''");

        let script = format!(
            "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null\n\
             [Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]|Out-Null\n\
             $app='{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe'\n\
             $xml=New-Object Windows.Data.Xml.Dom.XmlDocument\n\
             $xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>{t}</text><text>{b}</text></binding></visual></toast>')\n\
             $toast=[Windows.UI.Notifications.ToastNotification]::new($xml)\n\
             [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)"
        );

        // prepend UTF-8 BOM so PowerShell reads the file as UTF-8 (emoji/em-dash safe)
        let ps_path = std::env::temp_dir().join("screenwellness_notify.ps1");
        let mut bom_script = String::from("\u{FEFF}");
        bom_script.push_str(&script);
        std::fs::write(&ps_path, bom_script.as_bytes()).map_err(|e| e.to_string())?;

        let out = std::process::Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-File", ps_path.to_str().unwrap_or(""),
            ])
            .output()
            .map_err(|e| e.to_string())?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            return Err(format!("PS error: {} | {}", stderr.trim(), stdout.trim()));
        }

        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        _app.notification()
            .builder()
            .title(&title)
            .body(&body)
            .show()
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn default_report_dir() -> String {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    for var in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(p) = std::env::var(var) {
            candidates.push(std::path::PathBuf::from(p).join("Desktop"));
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        let home = std::path::PathBuf::from(home);
        candidates.push(home.join("Desktop"));
        candidates.push(home.join("Pictures"));
        candidates.push(home);
    }
    candidates
        .into_iter()
        .find(|p| p.is_dir())
        .unwrap_or_else(std::env::temp_dir)
        .display()
        .to_string()
}

#[tauri::command]
fn save_report(base64_data: String, path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
fn get_idle_seconds() -> u64 {
    #[cfg(target_os = "windows")]
    {
        return idle_win::idle_seconds();
    }
    #[cfg(not(target_os = "windows"))]
    0
}

// ── app setup ─────────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_sessions_table",
            sql: "CREATE TABLE IF NOT EXISTS sessions (\
                  id INTEGER PRIMARY KEY AUTOINCREMENT,\
                  app_name TEXT NOT NULL,\
                  start_time TEXT NOT NULL,\
                  end_time TEXT NOT NULL,\
                  duration_seconds INTEGER NOT NULL\
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_gamification_tables",
            sql: "CREATE TABLE IF NOT EXISTS points_log (\
                    id INTEGER PRIMARY KEY AUTOINCREMENT,\
                    date TEXT NOT NULL,\
                    reason TEXT NOT NULL,\
                    points INTEGER NOT NULL,\
                    created_at TEXT NOT NULL\
                  );\
                  CREATE TABLE IF NOT EXISTS badges (\
                    id TEXT PRIMARY KEY,\
                    earned_at TEXT NOT NULL\
                  );\
                  CREATE TABLE IF NOT EXISTS streak (\
                    id INTEGER PRIMARY KEY CHECK (id = 1),\
                    current_streak INTEGER NOT NULL DEFAULT 0,\
                    last_earned_date TEXT NOT NULL DEFAULT ''\
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_lid_log_table",
            sql: "CREATE TABLE IF NOT EXISTS lid_log (\
                    id INTEGER PRIMARY KEY AUTOINCREMENT,\
                    paused_at TEXT NOT NULL,\
                    resumed_at TEXT\
                  );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:screenwellness.db", migrations)
                .build(),
        )
        .setup(|app| {
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ScreenWellness")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == MouseButton::Left {
                            let window = tray
                                .app_handle()
                                .get_webview_window("main")
                                .unwrap();
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            power_monitor::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_active_window, get_idle_seconds, send_notification, set_always_on_top, focus_main_window, default_report_dir, save_report])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
