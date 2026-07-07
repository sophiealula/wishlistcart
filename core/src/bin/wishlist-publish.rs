// Publishes the family page from the shared wishlist file. Run by launchd
// whenever the file changes; exits 0 quietly when unconfigured so a fresh
// machine never spams launchd logs.
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use wishlistcart_core::publishing::{load_config, publish};
use wishlistcart_core::store::load;

fn main() {
    let home = std::env::var("HOME").expect("HOME not set");
    let config_path = std::env::var("WISHLIST_PUBLISH_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(&home).join(".config/wishlistcart/publish.json"));
    let Some(config) = load_config(&config_path) else {
        eprintln!("wishlist-publish: no config at {}, nothing to do", config_path.display());
        return;
    };
    let wishlist = std::env::var("WISHLIST_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(&home)
                .join("Library/Mobile Documents/com~apple~CloudDocs/WishlistCart/wishlist.json")
        });
    let store = match load(&wishlist) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("wishlist-publish: cannot read {}: {e}", wishlist.display());
            std::process::exit(1);
        }
    };
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    if let Err(e) = publish(&store, &config, now) {
        eprintln!("wishlist-publish: {e}");
        std::process::exit(1);
    }
    println!("wishlist-publish: published {} items", store.items.iter().filter(|i| !i.deleted).count());
}
