#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_URL="${VITE_API_URL:-https://clack-3vmlc64xka-uc.a.run.app}"

echo "==> Building frontend with VITE_API_URL=$API_URL"
cd "$ROOT_DIR/frontend"
# Keep console.log in Electron builds for debugging (production web strips them)
VITE_API_URL="$API_URL" VITE_KEEP_CONSOLE=1 npx vite build

echo "==> Copying frontend build to electron/frontend-dist"
rm -rf "$SCRIPT_DIR/frontend-dist"
cp -r "$ROOT_DIR/frontend/dist" "$SCRIPT_DIR/frontend-dist"

echo "==> Installing electron dependencies"
cd "$SCRIPT_DIR"
npm install

echo "==> Compiling TypeScript"
npx tsc

echo "==> Building macOS DMG"
npx electron-builder --mac

echo "==> Done! DMG is in electron/release/"
ls -la "$SCRIPT_DIR/release/"*.dmg 2>/dev/null || echo "Check electron/release/ for output"
