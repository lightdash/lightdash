#!/bin/sh
# Creates the dev buckets in RustFS. Runs in a one-shot `rustfs/rc` container
# (the RustFS server image ships no S3 client) and exits when done.
#
# CORS is not configured here: RUSTFS_CORS_ALLOWED_ORIGINS on the server covers
# every bucket, including ones created later by the app.
set -e

ENDPOINT="${RUSTFS_ENDPOINT:-http://rustfs:9000}"
BUCKETS="${RUSTFS_DEFAULT_BUCKETS:-default}"
EXPIRATION_DAYS="${RUSTFS_EXPIRATION_DAYS:-1}"

# `rc alias set` verifies the endpoint AND the credentials, so it doubles as the
# readiness probe. Keep the last error: a wrong key fails the same way an
# unreachable server does, and the two need telling apart.
echo "Waiting for RustFS at $ENDPOINT..."
i=0
until LAST_ERROR="$(rc alias set local "$ENDPOINT" "$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" 2>&1)"; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Could not reach RustFS at $ENDPOINT after 60s." >&2
    echo "Check the server is up and RUSTFS_ACCESS_KEY/RUSTFS_SECRET_KEY match it." >&2
    echo "Last error: $LAST_ERROR" >&2
    exit 1
  fi
  sleep 1
done

echo "RustFS is ready. Creating buckets..."

IFS=','
for bucket in $BUCKETS; do
  [ -n "$bucket" ] || continue

  rc bucket create -p "local/$bucket" >/dev/null 2>&1 ||
    echo "Bucket '$bucket' already exists or could not be created"

  # Auto-delete objects after N days so dev volumes don't grow without bound.
  # 0 disables expiry and clears any rule a previous run left behind.
  rc bucket lifecycle rule rm --all --force "local/$bucket" >/dev/null 2>&1 || true
  if [ "$EXPIRATION_DAYS" -gt 0 ] 2>/dev/null; then
    echo "Setting lifecycle policy for bucket '$bucket': expire after $EXPIRATION_DAYS day(s)"
    rc bucket lifecycle rule add "local/$bucket" --expiry-days "$EXPIRATION_DAYS" >/dev/null 2>&1 ||
      echo "Could not set lifecycle policy for bucket '$bucket'"
  else
    echo "Lifecycle expiration disabled for bucket '$bucket'"
  fi
done

echo "RustFS bucket setup complete."
