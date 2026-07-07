use crate::model::Item;
use std::collections::HashMap;

const TOMBSTONE_TTL_MS: i64 = 90 * 24 * 60 * 60 * 1000;

/// Union by id, last-write-wins per item by stamp(). Ties keep `ours`.
pub fn merge(ours: Vec<Item>, theirs: Vec<Item>) -> Vec<Item> {
    let mut by_id: HashMap<String, Item> = HashMap::new();
    for item in ours {
        by_id.insert(item.id.clone(), item);
    }
    for item in theirs {
        match by_id.get(&item.id) {
            Some(existing) if existing.stamp() >= item.stamp() => {}
            _ => {
                by_id.insert(item.id.clone(), item);
            }
        }
    }
    by_id.into_values().collect()
}

/// Drop tombstones old enough that every replica has seen them.
pub fn purge_tombstones(items: Vec<Item>, now_ms: i64) -> Vec<Item> {
    items
        .into_iter()
        .filter(|i| !i.deleted || now_ms - i.stamp() < TOMBSTONE_TTL_MS)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, updated_at: i64, deleted: bool, title: &str) -> Item {
        Item {
            id: id.into(),
            title: Some(title.into()),
            brand: None, price: None, currency: None, category: None,
            image: None, url: None, qty: None, color: None, size: None,
            added_at: Some(1), updated_at: Some(updated_at), deleted,
        }
    }

    #[test]
    fn newer_wins_both_directions() {
        let merged = merge(
            vec![item("a", 10, false, "old"), item("b", 20, false, "ours-new")],
            vec![item("a", 15, false, "new"), item("b", 5, false, "theirs-old")],
        );
        let get = |id: &str| merged.iter().find(|i| i.id == id).unwrap().title.clone().unwrap();
        assert_eq!(get("a"), "new");
        assert_eq!(get("b"), "ours-new");
    }

    #[test]
    fn tie_keeps_ours_and_union_includes_unique_items() {
        let merged = merge(
            vec![item("a", 10, false, "ours")],
            vec![item("a", 10, false, "theirs"), item("c", 1, false, "only-theirs")],
        );
        assert_eq!(merged.len(), 2);
        assert_eq!(merged.iter().find(|i| i.id == "a").unwrap().title.as_deref(), Some("ours"));
    }

    #[test]
    fn delete_vs_edit_is_plain_lww() {
        let merged = merge(
            vec![item("a", 10, true, "tombstone")],
            vec![item("a", 15, false, "edited-later")],
        );
        assert!(!merged[0].deleted); // newer edit resurrects
        let merged2 = merge(
            vec![item("a", 20, true, "tombstone")],
            vec![item("a", 15, false, "edited-earlier")],
        );
        assert!(merged2[0].deleted); // newer delete sticks
    }

    #[test]
    fn purges_only_expired_tombstones() {
        let now = TOMBSTONE_TTL_MS + 1000;
        let out = purge_tombstones(
            vec![
                item("old-tomb", 999, true, "x"),          // expired
                item("new-tomb", now - 1000, true, "y"),   // fresh
                item("live", 1, false, "z"),
            ],
            now,
        );
        let ids: Vec<&str> = out.iter().map(|i| i.id.as_str()).collect();
        assert!(!ids.contains(&"old-tomb"));
        assert!(ids.contains(&"new-tomb"));
        assert!(ids.contains(&"live"));
    }
}
