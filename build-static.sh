#!/usr/bin/env bash
#
# build-static.sh — assemble the combined static site for Vercel.
#
# Output layout (in ./public, Vercel's outputDirectory):
#   public/                ← the marketing site (/website) at the domain root
#   public/play/           ← the built game client (/client) at /play/
#   public/ads.txt         ← AdSense ownership file (served at the root)
#
# The game client is built with base=/play/ so its asset URLs resolve under
# the sub-path. The marketing site is plain static HTML/CSS/JS — copied as-is.
#
# Run locally to preview the production layout:
#   bash ./build-static.sh && npx serve public
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/public"

echo "→ Cleaning output dir: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "→ Building game client (base=/play/)…"
cd "$ROOT/client"
# Vite's defineConfig reads BASE; force the sub-path regardless of NODE_ENV.
# MSYS_NO_PATHCONV stops Git-Bash on Windows from rewriting the leading-slash
# value (/play/) into a Windows path. No effect on Linux (Vercel's builder).
MSYS_NO_PATHCONV=1 BASE=/play/ npm run build
cd "$ROOT"

echo "→ Copying marketing site → public/"
cp -R "$ROOT/website/." "$OUT/"

echo "→ Copying game build → public/play/"
mkdir -p "$OUT/play"
cp -R "$ROOT/client/dist/." "$OUT/play/"

echo "✓ Combined static build ready in $OUT"
echo "  root  → marketing site"
echo "  /play → game client"
