use crate::model::Store;
use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("corrupt wishlist file: {0}")]
    Corrupt(#[from] serde_json::Error),
}

/// Missing file → empty store. A file that exists but doesn't parse is an
/// error: never clobber data we can't read.
pub fn load(path: &Path) -> Result<Store, StoreError> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Store::default()),
        Err(e) => Err(e.into()),
    }
}

/// Atomic: write a temp file in the same directory, then rename over.
pub fn save(path: &Path, store: &Store) -> Result<(), StoreError> {
    let dir = path.parent().unwrap_or(Path::new("."));
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(serde_json::to_string_pretty(store)?.as_bytes())?;
    tmp.persist(path).map_err(|e| StoreError::Io(e.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Item;

    #[test]
    fn missing_file_is_empty_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = load(&dir.path().join("nope/wishlist.json")).unwrap();
        assert_eq!(store.version, 1);
        assert!(store.items.is_empty());
    }

    #[test]
    fn round_trips_and_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("deep/nested/wishlist.json");
        let mut store = Store::default();
        store.items.push(Item {
            id: "a".into(), title: Some("Tee".into()),
            brand: None, price: Some(12.5), currency: Some("USD".into()),
            category: None, image: None, url: None, qty: Some(2),
            color: None, size: None, added_at: Some(1), updated_at: Some(2),
            deleted: false,
        });
        save(&path, &store).unwrap();
        assert_eq!(load(&path).unwrap(), store);
    }

    #[test]
    fn corrupt_file_errors_instead_of_clobbering() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("wishlist.json");
        std::fs::write(&path, "{not json").unwrap();
        assert!(matches!(load(&path), Err(StoreError::Corrupt(_))));
    }
}
