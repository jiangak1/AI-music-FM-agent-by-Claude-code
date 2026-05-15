use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri::tray::TrayIconBuilder;

struct SidecarProc(Mutex<Option<Child>>);

fn wait_for_server(url: &str, max_retries: u32) -> bool {
    for i in 0..max_retries {
        match ureq::get(url).call() {
            Ok(_) => {
                log::info!("Server ready at {url} after {i} retries");
                return true;
            }
            Err(e) => {
                log::info!("Waiting for server... ({i}/{max_retries}): {e}");
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    }
    log::error!("Server failed to start at {url}");
    false
}

fn start_node_server() -> Option<Child> {
    let server_dir = std::env::current_dir()
        .ok()?
        .parent()?
        .join("server");

    log::info!("Starting Node.js server from: {}", server_dir.display());

    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&server_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .ok()?;

    log::info!("Node.js server started with PID: {}", child.id());

    wait_for_server("http://localhost:3000/api/status", 30);

    Some(child)
}

fn kill_sidecar(child: &mut Option<Child>) {
    if let Some(ref mut proc) = child {
        log::info!("Shutting down Node.js server (PID: {})...", proc.id());
        let _ = proc.kill();
        let _ = proc.wait();
        *child = None;
        log::info!("Node.js server stopped.");
    }
}

#[tauri::command]
fn restart_sidecar(state: tauri::State<SidecarProc>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    kill_sidecar(&mut guard);
    let child = start_node_server().ok_or("Failed to restart Node.js server")?;
    *guard = Some(child);
    Ok("Server restarted".into())
}

#[tauri::command]
fn get_sidecar_status(state: tauri::State<SidecarProc>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(child) => Ok(format!("running (PID: {})", child.id())),
        None => Ok("stopped".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Start Node.js sidecar (blocks until server is ready)
            let child = start_node_server();
            app.manage(SidecarProc(Mutex::new(child)));

            // Create main window pointing to the Node.js server
            // This works for both dev and production — all relative API paths resolve correctly
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External("http://localhost:3000".parse().unwrap()),
            )
            .title("AI 电台 FM 102.4")
            .inner_size(400.0, 820.0)
            .min_inner_size(360.0, 600.0)
            .center()
            .build()?;

            // Bring to front
            let _ = window.set_focus();

            // System tray
            let icon = app.default_window_icon().cloned().unwrap();
            let _tray = TrayIconBuilder::with_id("ai-radio-tray")
                .tooltip("AI 电台")
                .icon(icon)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .menu(
                    &tauri::menu::MenuBuilder::new(app)
                        .item(
                            &tauri::menu::MenuItemBuilder::with_id("show", "显示/隐藏")
                                .build(app)?,
                        )
                        .separator()
                        .item(
                            &tauri::menu::MenuItemBuilder::with_id("quit", "退出")
                                .build(app)?,
                        )
                        .build()?,
                )
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(sidecar) = window.try_state::<SidecarProc>() {
                    let mut guard = sidecar.0.lock().unwrap();
                    kill_sidecar(&mut guard);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![restart_sidecar, get_sidecar_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
