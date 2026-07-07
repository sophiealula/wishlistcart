use crate::model::{Item, Store};
use crate::store::StoreError;
use serde::Deserialize;
use serde_json::json;
use std::fs;
use std::path::Path;
use std::process::Command;

// Baked into the binary so the publisher is a single self-contained file.
const INDEX_HTML: &str = include_str!("../../family/index.html");
const STYLES_CSS: &str = include_str!("../../extension/styles.css");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishConfig {
    pub remote: String,
    pub work_dir: String,
}

pub fn load_config(path: &Path) -> Option<PublishConfig> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Write the static site: page, styles, and visible items only — tombstones
/// and anything deleted never leave the machine.
pub fn render_site(store: &Store, out_dir: &Path, now_ms: i64) -> Result<(), StoreError> {
    fs::create_dir_all(out_dir)?;
    fs::write(out_dir.join("index.html"), INDEX_HTML)?;
    fs::write(out_dir.join("styles.css"), STYLES_CSS)?;
    let mut visible: Vec<&Item> = store.items.iter().filter(|i| !i.deleted).collect();
    visible.sort_by_key(|i| std::cmp::Reverse(i.added_at.unwrap_or(0)));
    let payload = json!({ "publishedAt": now_ms, "items": visible });
    fs::write(out_dir.join("items.json"), serde_json::to_string_pretty(&payload)?)?;
    Ok(())
}

fn git(work_dir: &Path, args: &[&str]) -> Result<(), String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(work_dir)
        .args(["-c", "user.name=wishlist-publish", "-c", "user.email=wishlist@localhost"])
        .args(args)
        .output()
        .map_err(|e| format!("git spawn: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("git {args:?}: {}", String::from_utf8_lossy(&out.stderr)))
    }
}

/// Commit locally, force-push: the site is derived state, so if another Mac
/// published in between, whoever pushes last simply wins — no merging.
pub fn publish(store: &Store, config: &PublishConfig, now_ms: i64) -> Result<(), String> {
    let work_dir = Path::new(&config.work_dir);
    render_site(store, work_dir, now_ms).map_err(|e| e.to_string())?;
    if !work_dir.join(".git").exists() {
        git(work_dir, &["init", "-q", "-b", "main"])?;
    }
    // remote may already exist; setting the URL is idempotent either way
    let _ = git(work_dir, &["remote", "add", "origin", &config.remote]);
    git(work_dir, &["remote", "set-url", "origin", &config.remote])?;
    git(work_dir, &["add", "-A"])?;
    // --allow-empty: publishing identical content twice is still a success
    git(work_dir, &["commit", "-q", "--allow-empty", "-m", "publish"])?;
    git(work_dir, &["push", "-q", "--force", "origin", "main"])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Item;

    fn store_with(items: Vec<Item>) -> Store {
        Store { version: 1, items }
    }

    fn item(id: &str, title: &str, deleted: bool) -> Item {
        Item {
            id: id.into(), title: Some(title.into()), brand: None, price: Some(10.0),
            currency: Some("USD".into()), category: Some("tops".into()), image: None,
            url: None, qty: Some(1), color: None, size: None,
            added_at: Some(1), updated_at: Some(1), deleted,
        }
    }

    #[test]
    fn render_writes_site_and_hides_tombstones() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_with(vec![item("a", "Live", false), item("b", "Ghost", true)]);
        render_site(&store, dir.path(), 123).unwrap();
        assert!(dir.path().join("index.html").exists());
        assert!(dir.path().join("styles.css").exists());
        let payload: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.path().join("items.json")).unwrap())
                .unwrap();
        assert_eq!(payload["publishedAt"], 123);
        let items = payload["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["title"], "Live");
    }

    #[test]
    fn publish_force_pushes_single_commit_to_remote() {
        let remote_dir = tempfile::tempdir().unwrap();
        let work_dir = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q", "--bare", "-b", "main"])
            .arg(remote_dir.path())
            .status().unwrap().success());
        let config = PublishConfig {
            remote: remote_dir.path().to_str().unwrap().into(),
            work_dir: work_dir.path().to_str().unwrap().into(),
        };
        publish(&store_with(vec![item("a", "First", false)]), &config, 1).unwrap();
        publish(&store_with(vec![item("a", "Second", false)]), &config, 2).unwrap();

        let count = Command::new("git")
            .args(["-C", config.remote.as_str(), "rev-list", "--count", "main"])
            .output().unwrap();
        assert_eq!(String::from_utf8_lossy(&count.stdout).trim(), "2");
        let show = Command::new("git")
            .args(["-C", config.remote.as_str(), "show", "main:items.json"])
            .output().unwrap();
        assert!(String::from_utf8_lossy(&show.stdout).contains("Second"));
    }
}
