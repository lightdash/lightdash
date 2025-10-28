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
  fi
done

wait