use crate::merge::{merge, purge_tombstones};
use crate::model::{Item, Store};
use crate::store::{load, save, StoreError};
use crate::urlnorm::normalize_url;
use serde_json::Value;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const EDITABLE: [&str; 10] =
    ["title", "brand", "price", "currency", "category", "image", "url", "qty", "color", "size"];

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

/// Non-deleted items, newest first — the shape every op returns to callers.
fn visible(store: &Store) -> Vec<Item> {
    let mut items: Vec<Item> = store.items.iter().filter(|i| !i.deleted).cloned().collect();
    items.sort_by_key(|i| std::cmp::Reverse(i.added_at.unwrap_or(0)));
    items
}

fn write_back(path: &Path, mut store: Store) -> Result<Store, StoreError> {
    store.items = purge_tombstones(store.items, now_ms());
    save(path, &store)?;
    Ok(store)
}

pub fn get_items(path: &Path) -> Result<Vec<Item>, StoreError> {
    Ok(visible(&load(path)?))
}

pub struct SaveResult {
    pub added: bool,
    pub items: Vec<Item>,
}

/// Insert a scraped item: stamp id + timestamps, dedupe by normalized URL.
pub fn save_item(path: &Path, mut item: Item) -> Result<SaveResult, StoreError> {
    let store = load(path)?;
    if let Some(url) = &item.url {
        let key = normalize_url(url);
        let dupe = store.items.iter().any(|i| {
            !i.deleted && i.url.as_deref().map(normalize_url) == Some(key.clone())
        });
        if dupe {
            return Ok(SaveResult { added: false, items: visible(&store) });
        }
    }
    let now = now_ms();
    item.id = uuid::Uuid::new_v4().to_string();
    item.added_at = Some(now);
    item.updated_at = Some(now);
    item.deleted = false;
    let mut store = store;
    store.items.push(item);
    let store = write_back(path, store)?;
    Ok(SaveResult { added: true, items: visible(&store) })
}

/// Apply a patch of editable fields (values arrive pre-normalized by the JS
/// side) and stamp updatedAt. Unknown ids are a no-op.
pub fn update_item(path: &Path, id: &str, patch: &Value) -> Result<Vec<Item>, StoreError> {
    let mut store = load(path)?;
    let mut changed = false;
    for item in store.items.iter_mut() {
        if item.id != id || item.deleted {
            continue;
        }
        let mut as_value = serde_json::to_value(&*item).unwrap();
        if let (Some(obj), Some(p)) = (as_value.as_object_mut(), patch.as_object()) {
            for key in EDITABLE {
                if let Some(v) = p.get(key) {
                    if v.is_null() {
                        obj.remove(key);
                    } else {
                        obj.insert(key.to_string(), v.clone());
                    }
                }
            }
        }
        *item = serde_json::from_value(as_value).map_err(StoreError::Corrupt)?;
        item.updated_at = Some(now_ms());
        changed = true;
    }
    if !changed {
        return Ok(visible(&store));
    }
    Ok(visible(&write_back(path, store)?))
}

/// Tombstone, never hard-delete — removals must survive merges.
pub fn remove_item(path: &Path, id: &str) -> Result<Vec<Item>, StoreError> {
    let mut store = load(path)?;
    let mut changed = false;
    for item in store.items.iter_mut() {
        if item.id == id && !item.deleted {
            item.deleted = true;
            item.updated_at = Some(now_ms());
            changed = true;
        }
    }
    if !changed {
        return Ok(visible(&store));
    }
    Ok(visible(&write_back(path, store)?))
}

/// One-time browser-local migration: items keep their ids and timestamps.
pub fn import(path: &Path, incoming: Vec<Item>) -> Result<Vec<Item>, StoreError> {
    let store = load(path)?;
    let merged = merge(store.items, incoming);
    let store = write_back(path, Store { version: 1, items: merged })?;
    Ok(visible(&store))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scraped(title: &str, url: &str) -> Item {
        Item {
            id: String::new(), title: Some(title.into()), brand: None,
            price: Some(10.0), currency: Some("USD".into()), category: Some("tops".into()),
            image: None, url: Some(url.into()), qty: Some(1), color: None, size: None,
            added_at: None, updated_at: None, deleted: false,
        }
    }

    #[test]
    fn save_stamps_and_dedupes_by_normalized_url() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.json");
        let first = save_item(&path, scraped("Tee", "https://s.com/p?utm_source=x")).unwrap();
        assert!(first.added);
        assert!(!first.items[0].id.is_empty());
        assert!(first.items[0].added_at.is_some());
        let dupe = save_item(&path, scraped("Tee again", "https://s.com/p#reviews")).unwrap();
        assert!(!dupe.added);
        assert_eq!(dupe.items.len(), 1);
    }

    #[test]
    fn update_patches_fields_and_stamps() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.json");
        let saved = save_item(&path, scraped("Tee", "https://s.com/p")).unwrap();
        let id = saved.items[0].id.clone();
        let before = saved.items[0].updated_at.unwrap();
        let patch = serde_json::json!({"title":"New tee","qty":3,"color":"Red","brand":null});
        let items = update_item(&path, &id, &patch).unwrap();
        assert_eq!(items[0].title.as_deref(), Some("New tee"));
        assert_eq!(items[0].qty, Some(3));
        assert_eq!(items[0].color.as_deref(), Some("Red"));
        assert!(items[0].brand.is_none());
        assert!(items[0].updated_at.unwrap() >= before);
        // unknown id: no-op, same list back
        assert_eq!(update_item(&path, "nope", &patch).unwrap().len(), 1);
    }

    #[test]
    fn remove_tombstones_but_file_keeps_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.json");
        let saved = save_item(&path, scraped("Tee", "https://s.com/p")).unwrap();
        let id = saved.items[0].id.clone();
        let items = remove_item(&path, &id).unwrap();
        assert!(items.is_empty());
        let raw = load(&path).unwrap();
        assert_eq!(raw.items.len(), 1);
        assert!(raw.items[0].deleted);
        // saving the same URL after removal is allowed (tombstones don't dedupe)
        assert!(save_item(&path, scraped("Tee", "https://s.com/p")).unwrap().added);
    }

    #[test]
    fn import_merges_lww() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.json");
        let mut local = scraped("Browser tee", "https://s.com/a");
        local.id = "keep-me".into();
        local.added_at = Some(100);
        local.updated_at = Some(100);
        let items = import(&path, vec![local]).unwrap();
        assert_eq!(items[0].id, "keep-me");
        assert_eq!(items[0].added_at, Some(100));
    }
}
