#!/bin/bash
set -e

# Single source of truth for name/version: komari-theme.json
SHORT=$(node -p "require('./komari-theme.json').short")
VERSION=$(node -p "require('./komari-theme.json').version")
OUTPUT="${SHORT}-v${VERSION}.zip"

echo "Building $OUTPUT..."

npm run build

rm -f "$OUTPUT"

# komari-theme.json must sit at the zip root; keep static/ so "preview" resolves.
zip -r -X "$OUTPUT" komari-theme.json static/cover-image.png dist

echo "Created: $OUTPUT"
