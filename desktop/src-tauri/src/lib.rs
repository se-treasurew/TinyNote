use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tinynote.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            build_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running TinyNote");
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开 / 隐藏", true, None::<&str>)?;
    let add_today = MenuItem::with_id(app, "add_today", "添加今日任务", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "toggle_lock", "固定桌面", true, None::<&str>)?;
    let topmost = MenuItem::with_id(app, "toggle_topmost", "置顶", true, None::<&str>)?;
    let autostart = MenuItem::with_id(app, "toggle_autostart", "开机启动", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &add_today, &lock, &topmost, &autostart, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("TinyNote 小笺")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                        let _ = app.emit("tinynote://tray-event", "hide");
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit("tinynote://tray-event", "show");
                    }
                }
            }
            "add_today" => {
                let _ = app.emit("tinynote://tray-event", "add-today-task");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "toggle_lock" => {
                let _ = app.emit("tinynote://tray-event", "toggle-lock");
            }
            "toggle_topmost" => {
                let _ = app.emit("tinynote://tray-event", "toggle-topmost");
            }
            "toggle_autostart" => {
                let _ = app.emit("tinynote://tray-event", "toggle-autostart");
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_tinynote_mvp_schema",
            sql: r#"
            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              device_id TEXT,
              title TEXT NOT NULL,
              content TEXT,
              task_date TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active',
              priority TEXT NOT NULL DEFAULT 'none',
              source_type TEXT NOT NULL DEFAULT 'manual',
              routine_id TEXT,
              parent_task_id TEXT,
              sort_order INTEGER NOT NULL DEFAULT 0,
              completed_at TEXT,
              archived_at TEXT,
              deleted_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              sync_status TEXT NOT NULL DEFAULT 'local',
              version INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS routines (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              title TEXT NOT NULL,
              description TEXT,
              routine_type TEXT NOT NULL,
              start_date TEXT NOT NULL,
              end_date TEXT,
              repeat_rule TEXT,
              active_days TEXT,
              is_enabled INTEGER NOT NULL DEFAULT 1,
              progress_mode TEXT NOT NULL DEFAULT 'daily_instance',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              sync_status TEXT NOT NULL DEFAULT 'local',
              version INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS routine_instances (
              id TEXT PRIMARY KEY,
              routine_id TEXT NOT NULL,
              task_id TEXT NOT NULL,
              instance_date TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'generated',
              created_at TEXT NOT NULL,
              UNIQUE(routine_id, instance_date)
            );

            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_log (
              id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              operation TEXT NOT NULL,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL,
              synced_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_date_status ON tasks(task_date, status);
            CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_routine_id ON tasks(routine_id);
            CREATE INDEX IF NOT EXISTS idx_routines_is_enabled ON routines(is_enabled);
            CREATE INDEX IF NOT EXISTS idx_sync_log_synced_at ON sync_log(synced_at);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "enable_wal_journal_mode",
            sql: r#"
            PRAGMA journal_mode=WAL;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_task_progress_and_clear_legacy_routines",
            sql: r#"
            ALTER TABLE tasks ADD COLUMN end_date TEXT;

            CREATE TABLE IF NOT EXISTS task_progress_entries (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL,
              progress_date TEXT NOT NULL,
              percent INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'active',
              completed_at TEXT,
              archived_at TEXT,
              deleted_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              sync_status TEXT NOT NULL DEFAULT 'local',
              version INTEGER NOT NULL DEFAULT 1,
              UNIQUE(task_id, progress_date)
            );

            CREATE INDEX IF NOT EXISTS idx_task_progress_task_date ON task_progress_entries(task_id, progress_date);
            CREATE INDEX IF NOT EXISTS idx_task_progress_status ON task_progress_entries(status);

            DELETE FROM tasks WHERE routine_id IS NOT NULL OR source_type = 'routine_daily';
            DELETE FROM routine_instances;
            DELETE FROM routines;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_task_postpone_metadata",
            sql: r#"
            ALTER TABLE tasks ADD COLUMN postponed_at TEXT;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_task_postponement_history",
            sql: r#"
            CREATE TABLE IF NOT EXISTS task_postponements (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL,
              from_date TEXT NOT NULL,
              to_date TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              sync_status TEXT NOT NULL DEFAULT 'local',
              version INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_task_postponements_task_id ON task_postponements(task_id);
            CREATE INDEX IF NOT EXISTS idx_task_postponements_dates ON task_postponements(from_date, to_date);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "replace_archive_with_completed",
            sql: r#"
            UPDATE tasks
            SET status = 'completed',
                completed_at = COALESCE(completed_at, archived_at, updated_at),
                archived_at = NULL
            WHERE status = 'archived';

            UPDATE task_progress_entries
            SET status = 'completed',
                completed_at = COALESCE(completed_at, archived_at, updated_at),
                archived_at = NULL
            WHERE status = 'archived';

            DELETE FROM app_settings WHERE key = 'completeToArchive';
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_tasks_parent_task_id_index",
            sql: r#"
            CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
        "#,
            kind: MigrationKind::Up,
        },
    ]
}
