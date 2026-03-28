//! Load `.env` from the current directory or the first parent that contains one (workspace root).

use std::path::PathBuf;

/// Loads the first `.env` file found walking up from [`std::env::current_dir`].
/// Missing file is OK; parse errors are printed to stderr.
pub fn load_dotenv() {
    let mut dir: Option<PathBuf> = std::env::current_dir().ok();
    while let Some(d) = dir.take() {
        let p = d.join(".env");
        if p.is_file() {
            if let Err(e) = dotenvy::from_path(&p) {
                eprintln!("warning: could not load {}: {e}", p.display());
            }
            return;
        }
        dir = d.parent().map(|p| p.to_path_buf());
    }
}
