/// Port of the JS normalizeUrl: strip the hash, drop tracking query params,
/// pass unparseable input through unchanged. Implemented with plain string
/// handling to avoid pulling in a URL crate for four rules.
const TRACKING: [&str; 8] = ["utm_", "fbclid", "gclid", "mc_", "ref", "ref_", "_branch", "igshid"];

fn is_tracking(key: &str) -> bool {
    // JS uses /^(utm_|fbclid|gclid|mc_|ref|ref_|_branch|igshid)/i — a pure
    // prefix match. Port that exactly so both sides dedupe identically.
    let k = key.to_ascii_lowercase();
    TRACKING.iter().any(|p| k.starts_with(p))
}

pub fn normalize_url(url: &str) -> String {
    // Must look like scheme://... to be worth parsing; else pass through.
    let Some(scheme_end) = url.find("://") else { return url.to_string() };
    if scheme_end == 0 { return url.to_string() }

    let no_hash = &url[..url.find('#').unwrap_or(url.len())];
    let Some(qpos) = no_hash.find('?') else { return no_hash.to_string() };
    let (base, query) = (&no_hash[..qpos], &no_hash[qpos + 1..]);

    let kept: Vec<&str> = query
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or("");
            !key.is_empty() && !is_tracking(key)
        })
        .collect();

    if kept.is_empty() { base.to_string() } else { format!("{base}?{}", kept.join("&")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_hash_and_tracking_keeps_meaningful_query() {
        assert_eq!(
            normalize_url("https://shop.example/p/1?utm_source=x&color=red&fbclid=abc#reviews"),
            "https://shop.example/p/1?color=red"
        );
    }

    #[test]
    fn drops_query_entirely_when_all_tracking() {
        assert_eq!(
            normalize_url("https://shop.example/p/1?utm_campaign=a&gclid=b&ref=share"),
            "https://shop.example/p/1"
        );
    }

    #[test]
    fn passes_through_unparseable() {
        assert_eq!(normalize_url("not a url"), "not a url");
        assert_eq!(normalize_url(""), "");
    }

    #[test]
    fn matches_js_prefix_behavior() {
        // The JS regex is a prefix match, so even "referrer_code" is treated
        // as tracking (starts with "ref"). Faithful port > prettier rules.
        assert_eq!(normalize_url("https://s.com/p?ref=x"), "https://s.com/p");
        assert_eq!(normalize_url("https://s.com/p?ref_src=x"), "https://s.com/p");
        assert_eq!(normalize_url("https://s.com/p?referrer_code=x"), "https://s.com/p");
    }
}
