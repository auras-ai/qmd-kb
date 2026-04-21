#!/usr/bin/env bash
set -euo pipefail

# sync-qmd.sh — Export documents from D1 to local filesystem, then index with QMD.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=xxx ./scripts/sync-qmd.sh
#
# Prerequisites: wrangler CLI, qmd CLI, jq

DB_NAME="qmd-kb-db"
EXPORT_DIR="${QMD_EXPORT_DIR:-/tmp/qmd-kb-docs}"
WRANGLER="${WRANGLER_BIN:-npx wrangler}"

echo "=== QMD Knowledge DB Sync ==="
echo "Export dir: $EXPORT_DIR"

# Clean export directory
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

# Fetch collections
echo "Fetching collections..."
COLLECTIONS=$($WRANGLER d1 execute "$DB_NAME" --command "SELECT id, name FROM collections" --json 2>/dev/null | jq -r '.[0].results[] | @json')

if [ -z "$COLLECTIONS" ]; then
  echo "No collections found."
  exit 0
fi

echo "$COLLECTIONS" | while IFS= read -r row; do
  COLL_ID=$(echo "$row" | jq -r '.id')
  COLL_NAME=$(echo "$row" | jq -r '.name')

  echo "Processing collection: $COLL_NAME ($COLL_ID)"

  COLL_DIR="$EXPORT_DIR/$COLL_NAME"
  mkdir -p "$COLL_DIR"

  # Fetch documents for this collection
  DOCS=$($WRANGLER d1 execute "$DB_NAME" --command "SELECT path, content FROM documents WHERE collection_id = '$COLL_ID'" --json 2>/dev/null | jq -r '.[0].results[] | @json')

  if [ -z "$DOCS" ]; then
    echo "  No documents in $COLL_NAME"
    continue
  fi

  DOC_COUNT=0
  echo "$DOCS" | while IFS= read -r doc; do
    DOC_PATH=$(echo "$doc" | jq -r '.path')
    DOC_CONTENT=$(echo "$doc" | jq -r '.content')

    # Create subdirectories if needed
    FULL_PATH="$COLL_DIR/$DOC_PATH"
    mkdir -p "$(dirname "$FULL_PATH")"

    # Write content to file
    echo "$DOC_CONTENT" > "$FULL_PATH"
    DOC_COUNT=$((DOC_COUNT + 1))
  done

  echo "  Exported documents for $COLL_NAME"

  # Add to QMD
  echo "  Adding to QMD index..."
  qmd collection add "$COLL_DIR" --name "$COLL_NAME" 2>/dev/null || true
done

# Generate embeddings
echo "Generating embeddings..."
qmd embed

echo "=== Sync complete ==="
qmd status
