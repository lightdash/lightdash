#!/bin/sh
set -e

echo "Starting MinIO server in background..."
minio server /data --console-address ":9001" &

# Wait for MinIO API to be available
echo "Waiting for MinIO to become available..."
until mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null; do
  sleep 1
done

echo "MinIO is ready. Creating buckets..."

IFS=','
for bucket in $MINIO_DEFAULT_BUCKETS; do
  if [ -n "$bucket" ]; then
    if ! mc mb -p local/"$bucket" 2>/dev/null; then
      echo "Bucket '$bucket' already exists or could not be created"
    fi
    
    # Configure lifecycle policy to auto-delete files after MINIO_EXPIRATION_DAYS days (default: 1 day)
    EXPIRATION_DAYS="${MINIO_EXPIRATION_DAYS:-1}"
    if [ "$EXPIRATION_DAYS" -gt 0 ] 2>/dev/null; then
      echo "Setting lifecycle policy for bucket '$bucket': expire after $EXPIRATION_DAYS day(s)"
      mc ilm rule add --expire-days "$EXPIRATION_DAYS" local/"$bucket" 2>/dev/null || \
        echo "Could not set lifecycle policy for bucket '$bucket' (may already exist)"
    fi
  fi
done

wait