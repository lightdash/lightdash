#!/bin/bash
set -euo pipefail

# Snapshots the seeded preview database volume in the db-snapshot namespace so
# preview environments can divert from it (see okteto.preview.yaml). Expects
# docker/docker-compose.db-snapshot.yml to be deployed in that namespace and
# kubectl to be authenticated (okteto kubeconfig). Runs from
# .github/workflows/preview-db-snapshot.yml.

NAMESPACE="${DB_SNAPSHOT_NAMESPACE:-db-snapshot}"
SUFFIX="${1:?usage: preview-db-snapshot.sh <suffix, e.g. short sha>}"
# GCP rate-limits disk creation per source snapshot, so publish several
# identical copies and let previews spread their restores across them
# (okteto.preview.yaml picks one at random). Keep two generations.
COPIES=3
KEEP=6

is_seeded() {
    [ "$(kubectl -n "$NAMESPACE" exec statefulset/db-preview -- psql -U postgres -tAc \
        "SELECT to_regclass('jaffle.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM emails WHERE email = 'demo@lightdash.com')" \
        2>/dev/null)" = "t" ]
}

echo "Waiting for the seeder to finish (dbt + migrate + seed)..."
seeded=""
for _ in $(seq 1 120); do
    if is_seeded; then
        seeded=true
        break
    fi
    sleep 10
done
[ -n "$seeded" ] || {
    echo "Timed out waiting for the seed to complete"
    exit 1
}

# Flush to disk so the snapshot restores without WAL replay
kubectl -n "$NAMESPACE" exec statefulset/db-preview -- psql -U postgres -c "CHECKPOINT;"

# Sequential creation (waiting for ready between copies) also spaces the
# snapshot-create operations, which GCP rate-limits per source disk
ready_count=0
for i in $(seq 1 "$COPIES"); do
    SNAPSHOT_NAME="preview-db-${SUFFIX}-${i}"
    kubectl -n "$NAMESPACE" apply -f - <<EOF
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: ${SNAPSHOT_NAME}
  labels:
    app.kubernetes.io/part-of: lightdash-preview-db
spec:
  volumeSnapshotClassName: okteto-snapshot-class
  source:
    persistentVolumeClaimName: db-data
EOF

    echo "Waiting for ${SNAPSHOT_NAME} to be ready..."
    ready=""
    for _ in $(seq 1 60); do
        if [ "$(kubectl -n "$NAMESPACE" get volumesnapshot "$SNAPSHOT_NAME" -o jsonpath='{.status.readyToUse}' 2>/dev/null)" = "true" ]; then
            ready=true
            break
        fi
        sleep 10
    done
    if [ -n "$ready" ]; then
        ready_count=$((ready_count + 1))
        echo "Snapshot ${NAMESPACE}/${SNAPSHOT_NAME} is ready"
    else
        # Previews only consider readyToUse snapshots, so a straggler is
        # harmless; delete it and carry on with the copies that worked
        echo "Timed out waiting for ${SNAPSHOT_NAME}; removing it"
        kubectl -n "$NAMESPACE" delete volumesnapshot "$SNAPSHOT_NAME" --ignore-not-found
    fi
done
[ "$ready_count" -gt 0 ] || {
    echo "No snapshot copy became ready"
    exit 1
}

# Previews always divert from the newest ready snapshot; keep a few for safety
snapshots=$(kubectl -n "$NAMESPACE" get volumesnapshots \
    -l app.kubernetes.io/part-of=lightdash-preview-db \
    --sort-by=.metadata.creationTimestamp -o name)
count=$(echo "$snapshots" | grep -c . || true)
if [ "$count" -gt "$KEEP" ]; then
    echo "$snapshots" | head -n $((count - KEEP)) | xargs kubectl -n "$NAMESPACE" delete
fi
