#!/usr/bin/env bash
# Live proof of the golden-DB path against an Okteto preview namespace.
#
# Expects: okteto context already configured, kubectl available.
# Usage: ./scripts/prove-golden-db.sh <pr_number>
set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr_number>}"
NAMESPACE="pr-${PR_NUMBER}"
SNAPSHOT_CLASS="${GOLDEN_DB_SNAPSHOT_CLASS:-okteto-snapshot-class}"
PROOF_SNAP="golden-db-proof"

echo "== Prove golden DB path in namespace $NAMESPACE =="

okteto namespace use "$NAMESPACE" >/dev/null
okteto kubeconfig >/dev/null

echo "-- Pods --"
kubectl get pods -o wide

echo "-- PVCs --"
kubectl get pvc -o wide
PVC="$(kubectl get pvc -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | grep -iE 'postgres' | head -n1 || true)"
if [[ -z "$PVC" ]]; then
  echo "FAIL: no postgres PVC found (db-preview volume mount missing?)" >&2
  exit 1
fi
PHASE="$(kubectl get pvc "$PVC" -o jsonpath='{.status.phase}')"
echo "OK: PVC=$PVC phase=$PHASE"
[[ "$PHASE" == "Bound" ]] || { echo "FAIL: PVC not Bound" >&2; exit 1; }

DB_POD="$(kubectl get pods --no-headers | awk '/db-preview/ {print $1; exit}')"
APP_POD="$(kubectl get pods --no-headers | awk '/lightdash-preview/ {print $1; exit}')"
[[ -n "$DB_POD" ]] || { echo "FAIL: no db-preview pod" >&2; exit 1; }
echo "OK: DB_POD=$DB_POD APP_POD=${APP_POD:-none}"

echo "-- Wait for demo seed --"
for _ in $(seq 1 60); do
  if kubectl exec "$DB_POD" -- \
    psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM emails WHERE email='demo@lightdash.com'" 2>/dev/null | grep -q 1; then
    echo "OK: demo@lightdash.com present"
    break
  fi
  sleep 5
done
if ! kubectl exec "$DB_POD" -- \
  psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM emails WHERE email='demo@lightdash.com'" 2>/dev/null | grep -q 1; then
  echo "FAIL: demo user never appeared" >&2
  [[ -n "$APP_POD" ]] && kubectl logs "$APP_POD" --tail=80 >&2 || true
  exit 1
fi

if [[ -n "$APP_POD" ]]; then
  echo "-- Entrypoint path (from app logs) --"
  LOGS="$(kubectl logs "$APP_POD" --tail=200 2>/dev/null || true)"
  if echo "$LOGS" | grep -q 'already seeded'; then
    echo "OK: seed guard took golden/reuse path"
  elif echo "$LOGS" | grep -q 'Running full dbt'; then
    echo "OK: first-boot full migrate+seed path (expected before snapshot exists)"
  else
    echo "WARN: could not classify entrypoint path from recent logs"
  fi
fi

echo "-- VolumeSnapshotClass --"
if kubectl get volumesnapshotclass "$SNAPSHOT_CLASS" >/dev/null 2>&1; then
  echo "OK: VolumeSnapshotClass $SNAPSHOT_CLASS exists"
else
  echo "WARN: cannot read VolumeSnapshotClass $SNAPSHOT_CLASS (may be cluster-scoped Forbidden)"
  kubectl get volumesnapshotclass 2>&1 || true
fi

echo "-- Create proof VolumeSnapshot from $PVC --"
kubectl delete volumesnapshot "$PROOF_SNAP" --ignore-not-found=true >/dev/null
# Best-effort CHECKPOINT for cleaner crash-consistent snap
kubectl exec "$DB_POD" -- psql -U postgres -c "CHECKPOINT;" >/dev/null || true

cat <<EOF | kubectl apply -f -
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: ${PROOF_SNAP}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: lightdash-golden-db-proof
spec:
  volumeSnapshotClassName: ${SNAPSHOT_CLASS}
  source:
    persistentVolumeClaimName: ${PVC}
EOF

echo "-- Wait for snapshot ReadyToUse --"
for _ in $(seq 1 90); do
  READY="$(kubectl get volumesnapshot "$PROOF_SNAP" -o jsonpath='{.status.readyToUse}' 2>/dev/null || echo false)"
  if [[ "$READY" == "true" ]]; then
    echo "OK: VolumeSnapshot $PROOF_SNAP ready"
    kubectl get volumesnapshot "$PROOF_SNAP" -o wide
    break
  fi
  sleep 5
done
READY="$(kubectl get volumesnapshot "$PROOF_SNAP" -o jsonpath='{.status.readyToUse}' 2>/dev/null || echo false)"
if [[ "$READY" != "true" ]]; then
  echo "FAIL: VolumeSnapshot never became ready" >&2
  kubectl describe volumesnapshot "$PROOF_SNAP" >&2 || true
  exit 1
fi

echo "-- Clone PVC from proof snapshot --"
CLONE_PVC="postgres-data-golden-proof"
kubectl delete pvc "$CLONE_PVC" --ignore-not-found=true --wait=true --timeout=60s >/dev/null 2>&1 || true
SIZE="$(kubectl get pvc "$PVC" -o jsonpath='{.spec.resources.requests.storage}')"
SIZE="${SIZE:-10Gi}"
STORAGE_CLASS="$(kubectl get pvc "$PVC" -o jsonpath='{.spec.storageClassName}')"

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${CLONE_PVC}
  namespace: ${NAMESPACE}
spec:
  accessModes: ["ReadWriteOnce"]
  ${STORAGE_CLASS:+storageClassName: ${STORAGE_CLASS}}
  resources:
    requests:
      storage: ${SIZE}
  dataSource:
    name: ${PROOF_SNAP}
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
EOF

echo "-- Wait for clone PVC Bound --"
for _ in $(seq 1 60); do
  CPHASE="$(kubectl get pvc "$CLONE_PVC" -o jsonpath='{.status.phase}' 2>/dev/null || echo Pending)"
  if [[ "$CPHASE" == "Bound" ]]; then
    echo "OK: clone PVC $CLONE_PVC Bound"
    break
  fi
  sleep 5
done
CPHASE="$(kubectl get pvc "$CLONE_PVC" -o jsonpath='{.status.phase}' 2>/dev/null || echo Pending)"
if [[ "$CPHASE" != "Bound" ]]; then
  echo "FAIL: clone PVC not Bound (phase=$CPHASE)" >&2
  kubectl describe pvc "$CLONE_PVC" >&2 || true
  exit 1
fi

echo "-- Boot throwaway Postgres on clone and verify seed data --"
kubectl delete pod golden-db-proof-pg --ignore-not-found=true --wait=true --timeout=60s >/dev/null 2>&1 || true
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: golden-db-proof-pg
  namespace: ${NAMESPACE}
spec:
  restartPolicy: Never
  containers:
    - name: postgres
      image: pgvector/pgvector:pg18
      env:
        - name: POSTGRES_PASSWORD
          value: lightdash-preview-golden
      ports:
        - containerPort: 5432
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${CLONE_PVC}
EOF

for _ in $(seq 1 60); do
  if kubectl exec golden-db-proof-pg -- pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 3
done
if ! kubectl exec golden-db-proof-pg -- pg_isready -U postgres >/dev/null 2>&1; then
  echo "FAIL: proof postgres pod not ready" >&2
  kubectl describe pod golden-db-proof-pg >&2 || true
  kubectl logs golden-db-proof-pg >&2 || true
  exit 1
fi

# Password in snapshot is the stable preview password; POSTGRES_PASSWORD is ignored when PGDATA exists.
if ! PGPASSWORD=lightdash-preview-golden kubectl exec golden-db-proof-pg -- \
  env PGPASSWORD=lightdash-preview-golden \
  psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM emails WHERE email='demo@lightdash.com'" | grep -q 1; then
  echo "FAIL: demo user missing on cloned volume (snapshot restore broken or password mismatch)" >&2
  kubectl exec golden-db-proof-pg -- \
    env PGPASSWORD=lightdash-preview-golden \
    psql -U postgres -d postgres -c '\dt' >&2 || true
  exit 1
fi

if ! PGPASSWORD=lightdash-preview-golden kubectl exec golden-db-proof-pg -- \
  env PGPASSWORD=lightdash-preview-golden \
  psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders'" | grep -q 1; then
  echo "FAIL: jaffle.orders missing on cloned volume" >&2
  exit 1
fi

echo "OK: cloned volume has demo user + jaffle.orders (CoW restore works)"

echo "-- Cleanup proof pod/pvc/snapshot artifacts (keep original preview intact) --"
kubectl delete pod golden-db-proof-pg --ignore-not-found=true --wait=false >/dev/null
kubectl delete pvc "$CLONE_PVC" --ignore-not-found=true --wait=false >/dev/null
kubectl delete volumesnapshot "$PROOF_SNAP" --ignore-not-found=true --wait=false >/dev/null

echo
echo "PASS: live golden-DB primitives proven in $NAMESPACE"
echo "  - postgres PVC Bound"
echo "  - VolumeSnapshot create + ReadyToUse"
echo "  - PVC clone from snapshot Bound"
echo "  - restored PGDATA contains seed + jaffle data"
