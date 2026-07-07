// Chrome native-messaging host: 4-byte LE length prefix + JSON, both ways.
// One request per message; Chrome's sendNativeMessage spawns us per call, but
// we loop anyway so a long-lived port also works.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::PathBuf;
use wishlistcart_core::model::Item;
use wishlistcart_core::ops;

fn wishlist_path() -> PathBuf {
    if let Ok(p) = std::env::var("WISHLIST_FILE") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").expect("HOME not set");
    PathBuf::from(home)
        .join("Library/Mobile Documents/com~apple~CloudDocs/WishlistCart/wishlist.json")
}

fn read_message() -> Option<Value> {
    let mut len_buf = [0u8; 4];
    std::io::stdin().read_exact(&mut len_buf).ok()?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len == 0 || len > 16 * 1024 * 1024 {
        return None;
    }
    let mut buf = vec![0u8; len];
    std::io::stdin().read_exact(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

fn write_message(value: &Value) {
    let bytes = serde_json::to_vec(value).expect("serialize response");
    let mut out = std::io::stdout().lock();
    out.write_all(&(bytes.len() as u32).to_le_bytes()).expect("write len");
    out.write_all(&bytes).expect("write body");
    out.flush().expect("flush");
}

fn items_json(items: Vec<Item>) -> Value {
    serde_json::to_value(items).expect("serialize items")
}

fn handle(req: &Value) -> Value {
    let path = wishlist_path();
    let op = req.get("op").and_then(Value::as_str).unwrap_or("");
    let result = match op {
        "ping" => return json!({"ok": true, "pong": true}),
        "getItems" => ops::get_items(&path).map(|items| json!({"ok": true, "items": items_json(items)})),
        "saveItem" => match req.get("item").cloned().map(serde_json::from_value::<Item>) {
            Some(Ok(item)) => ops::save_item(&path, item)
                .map(|r| json!({"ok": true, "added": r.added, "items": items_json(r.items)})),
            _ => return json!({"ok": false, "error": "saveItem requires an item"}),
        },
        "updateItem" => match (req.get("id").and_then(Value::as_str), req.get("patch")) {
            (Some(id), Some(patch)) => ops::update_item(&path, id, patch)
                .map(|items| json!({"ok": true, "items": items_json(items)})),
            _ => return json!({"ok": false, "error": "updateItem requires id and patch"}),
        },
        "removeItem" => match req.get("id").and_then(Value::as_str) {
            Some(id) => ops::remove_item(&path, id)
                .map(|items| json!({"ok": true, "items": items_json(items)})),
            None => return json!({"ok": false, "error": "removeItem requires id"}),
        },
        "import" => match req.get("items").cloned().map(serde_json::from_value::<Vec<Item>>) {
            Some(Ok(items)) => ops::import(&path, items)
                .map(|items| json!({"ok": true, "items": items_json(items)})),
            _ => return json!({"ok": false, "error": "import requires items"}),
        },
        other => return json!({"ok": false, "error": format!("unknown op: {other}")}),
    };
    match result {
        Ok(v) => v,
        Err(e) => json!({"ok": false, "error": e.to_string()}),
    }
}

fn main() {
    while let Some(req) = read_message() {
        write_message(&handle(&req));
    }
}
