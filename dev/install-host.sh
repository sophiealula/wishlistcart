#!/usr/bin/env bash
# Build + install the wishlist-host native-messaging host on this Mac.
# Safe to re-run; overwrites the binary and Chrome host manifest.
set -euo pipefail
cd "$(dirname "$0")/.."

# Unpacked-extension IDs are sha256(extension dir path) hex[0:32] mapped a-p.
LAPTOP_ID="nnfacpdklceojhingfgmcfgdpkjjmplj"   # <repo>/extension on sophie's laptop
GOBLIN_ID="maihghimkloimpchnicmcacoajopcnek"   # ~/Documents/wishlistcart on goblin

cargo build --release --manifest-path core/Cargo.toml
mkdir -p "$HOME/.local/bin"
cp core/target/release/wishlist-host "$HOME/.local/bin/wishlist-host"

mkdir -p "$HOME/Library/Mobile Documents/com~apple~CloudDocs/WishlistCart"

for BROWSER_DIR in "Google/Chrome" "Arc/User Data"; do
  DIR="$HOME/Library/Application Support/$BROWSER_DIR/NativeMessagingHosts"
  [ -d "$(dirname "$DIR")" ] || continue
  mkdir -p "$DIR"
  cat > "$DIR/ai.2389.sophie.wishlistcart.json" <<EOF
{
  "name": "ai.2389.sophie.wishlistcart",
  "description": "WishlistCart shared-wishlist host",
  "path": "$HOME/.local/bin/wishlist-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$LAPTOP_ID/",
    "chrome-extension://$GOBLIN_ID/"
  ]
}
EOF
  echo "installed host manifest: $DIR"
done

echo "binary: $HOME/.local/bin/wishlist-host"
