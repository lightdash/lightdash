#!/bin/sh
# Mirrors each bucket from a MinIO source into a RustFS target. Runs inside a
# `rustfs/rc` container, which can reach both servers on the compose network.
# Driven by scripts/migrate-minio-to-rustfs.sh; not meant to be run directly.
#
# Reads only from the source. Nothing is deleted on either side, and re-running
# is safe: --overwrite refreshes objects that changed and skips ones that match.
set -e

rc alias set src "$SRC_ENDPOINT" "$SRC_ACCESS_KEY" "$SRC_SECRET_KEY" >/dev/null
rc alias set dst "$DST_ENDPOINT" "$DST_ACCESS_KEY" "$DST_SECRET_KEY" >/dev/null

MISMATCH=""

IFS=','
for bucket in $BUCKETS; do
  [ -n "$bucket" ] || continue

  echo "==> $bucket"

  if ! rc bucket list "src/$bucket" >/dev/null 2>&1; then
    echo "    source bucket '$bucket' does not exist, skipping"
    continue
  fi

  rc bucket create -p "dst/$bucket" >/dev/null 2>&1 || true
  rc mirror --overwrite "src/$bucket" "dst/$bucket"

  # rc exits 0 on a partial mirror, so compare both sides rather than trusting
  # the exit code.
  SRC_COUNT="$(rc object list --recursive "src/$bucket" 2>/dev/null | wc -l | tr -d ' ')"
  DST_COUNT="$(rc object list --recursive "dst/$bucket" 2>/dev/null | wc -l | tr -d ' ')"
  echo "    source: $SRC_COUNT objects, target: $DST_COUNT objects"

  if [ "$SRC_COUNT" != "$DST_COUNT" ]; then
    echo "    WARNING: object counts differ for '$bucket'" >&2
    MISMATCH=1
  fi
done

if [ -n "$MISMATCH" ]; then
  echo "Migration finished, but some buckets did not match. Re-run to retry." >&2
  exit 1
fi

echo "Migration complete. Every bucket matched."
