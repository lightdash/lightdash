#!/usr/bin/env bash
# Create (or refresh) VolumeSnapshots from the golden-db Postgres PVC.
#
# Usage (from repo root, with kubectl pointed at the golden-db namespace):
#   ./scripts/snapshot-golden-db.sh [git-sha]
#
# Creates:
#   golden-db-<sha>     — immutable rollback point
#   golden-db-latest    — stable name previews clone from
#
# Keeps the most recent KEEP_COUNT sha-tagged snapshots (default 5).
set -euo pipefail

NAMESPACE="${GOLDEN_DB_NAMESPACE:-golden-db}"
SNAPSHOT_CLASS="${GOLDEN_DB_SNAPSHOT_CLASS:-okteto-snapshot-class}"
KEEP_COUNT="${GOLDEN_DB_KEEP_COUNT:-5}"
SHA="${1:-$(git rev-parse --short HEAD)}"
SHA_SNAP="golden-db-${SHA}"
LATEST_SNAP="golden-db-latest"

echo "Using namespace: $NAMESPACE"

okteto namespace use "$NAMESPACE" >/dev/null
okteto kubeconfig >/dev/null

# Discover the Postgres PVC created by the compose volume `postgres_data`.
PVC="$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
  | grep -iE 'postgres' | head -n1 || true)"
if [[ -z "$PVC" ]]; then
  echo "No postgres PVC found in namespace $NAMESPACE" >&2
  kubectl get pvc -n "$NAMESPACE" >&2 || true
  exit 1
fi
echo "Source PVC: $PVC"

# Quiesce writers briefly for a cleaner crash-consistent snapshot.
DB_POD="$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
  | awk '/db-preview/ {print $1; exit}')"
if [[ -n "$DB_POD" ]]; then
  echo "CHECKPOINT on $DB_POD"
  kubectl exec -n "$NAMESPACE" "$DB_POD" -- \
    psql -U postgres -c "CHECKPOINT;" >/dev/null || true
fi

create_snapshot() {
  local name="$1"
  echo "Creating VolumeSnapshot $NAMESPACE/$name from PVC $PVC"
  kubectl delete volumesnapshot "$name" -n "$NAMESPACE" --ignore-not-found=true >/dev/null
  cat <<EOF | kubectl apply -f -
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: ${name}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: lightdash-golden-db
    lightdash.com/golden-db-sha: "${SHA}"
spec:
  volumeSnapshotClassName: ${SNAPSHOT_CLASS}
  source:
    persistentVolumeClaimName: ${PVC}
EOF
}

wait_ready() {
  local name="$1"
  echo "Waiting for VolumeSnapshot $name to become ready..."
  for _ in $(seq 1 90); do
    READY="$(kubectl get volumesnapshot "$name" -n "$NAMESPACE" \
      -o jsonpath='{.status.readyToUse}' 2>/dev/null || echo false)"
    if [[ "$READY" == "true" ]]; then
      echo "OK: $name ready"
      return 0
    fi
    sleep 5
  done
  echo "Timed out waiting for VolumeSnapshot $name" >&2
  kubectl describe volumesnapshot "$name" -n "$NAMESPACE" >&2 || true
  return 1
}

create_snapshot "$SHA_SNAP"
wait_ready "$SHA_SNAP"

create_snapshot "$LATEST_SNAP"
wait_ready "$LATEST_SNAP"

echo "Pruning old sha-tagged snapshots (keeping last $KEEP_COUNT)..."
kubectl get volumesnapshot -n "$NAMESPACE" \
  -l app.kubernetes.io/name=lightdash-golden-db \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
  | grep -E '^golden-db-[0-9a-f]+$' \
  | head -n -"$KEEP_COUNT" \
  | while read -r old; do
      [[ -z "$old" || "$old" == "$SHA_SNAP" || "$old" == "$LATEST_SNAP" ]] && continue
      echo "Deleting old snapshot $old"
      kubectl delete volumesnapshot "$old" -n "$NAMESPACE" --ignore-not-found=true
    done

echo "Done. Previews can clone from ${NAMESPACE}/${LATEST_SNAP}"
kubectl get volumesnapshot -n "$NAMESPACE"
