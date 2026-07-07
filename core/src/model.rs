use serde::{Deserialize, Serialize};

/// Mirrors the JS item shape exactly — camelCase keys, everything but `id`
/// optional so files written by any version round-trip.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qty: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub deleted: bool,
}

impl Item {
    /// Timestamp used for last-write-wins comparisons.
    pub fn stamp(&self) -> i64 {
        self.updated_at.or(self.added_at).unwrap_or(0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Store {
    pub version: u32,
    pub items: Vec<Item>,
}

impl Default for Store {
    fn default() -> Self {
        Store { version: 1, items: vec![] }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_js_shaped_json() {
        let js = r#"{"id":"a1","title":"Trail Pants","brand":"REI","price":49.73,
            "currency":"USD","category":"bottoms","image":"https://img/p.jpg",
            "url":"https://shop.example/pants","qty":2,"color":"Navy","size":"M",
            "addedAt":1751900000000,"updatedAt":1751900001000}"#;
        let item: Item = serde_json::from_str(js).unwrap();
        assert_eq!(item.qty, Some(2));
        assert_eq!(item.added_at, Some(1751900000000));
        assert!(!item.deleted);
        let out = serde_json::to_value(&item).unwrap();
        assert_eq!(out["addedAt"], 1751900000000i64);
        assert_eq!(out["color"], "Navy");
        assert!(out.get("deleted").is_none()); // not serialized when false
    }

    #[test]
    fn tolerates_missing_fields() {
        let item: Item = serde_json::from_str(r#"{"id":"x"}"#).unwrap();
        assert_eq!(item.stamp(), 0);
        let tomb: Item = serde_json::from_str(r#"{"id":"y","deleted":true,"updatedAt":5}"#).unwrap();
        assert!(tomb.deleted);
        assert_eq!(tomb.stamp(), 5);
    }
}
