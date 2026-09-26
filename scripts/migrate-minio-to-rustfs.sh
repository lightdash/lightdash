#!/usr/bin/env bash
# Copies every object from MinIO into RustFS, so the app can be repointed at
# RustFS without losing screenshots, CSV exports, cached results or generated
# app bundles.
#
# Reads only from MinIO. Nothing is deleted on either side, and the script is
# safe to re-run: it refreshes objects that changed and skips ones that match.
# Run it while both services are up, then repoint S3_ENDPOINT.
#
# Usage:
#   scripts/migrate-minio-to-rustfs.sh [--network NAME] [--buckets a,b,c]
#
# Environment overrides:
#   MINIO_ENDPOINT      default http://minio:9000    (as seen from the network)
#   MINIO_ACCESS_KEY    default minioadmin
#   MINIO_SECRET_KEY    default minioadmin
#   RUSTFS_ENDPOINT     default http://rustfs:9000
#   RUSTFS_ACCESS_KEY   default rustfsadmin
#   RUSTFS_SECRET_KEY   default rustfsadmin
#   RC_IMAGE            default rustfs/rc:v0.1.36
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INNER_SCRIPT="$REPO_ROOT/docker/mirror-to-rustfs.sh"

NETWORK=""
BUCKETS="${BUCKETS:-${RUSTFS_DEFAULT_BUCKETS:-default,results,lightdash-apps}}"

while [ $# -gt 0 ]; do
    case "$1" in
        --network) NETWORK="${2:?--network needs a value}"; shift 2 ;;
        --buckets) BUCKETS="${2:?--buckets needs a value}"; shift 2 ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "error: unknown argument '$1'" >&2; exit 2 ;;
    esac
done

test -f "$INNER_SCRIPT" || { echo "error: cannot find $INNER_SCRIPT" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "error: docker is required" >&2; exit 1; }

# Both endpoints have to resolve from inside the container, so it joins the
# network the servers are already on. Auto-detect it from the running RustFS
# container; ambiguity is an error rather than a guess.
if [ -z "$NETWORK" ]; then
    mapfile -t RUSTFS_CONTAINERS < <(docker ps --filter "name=rustfs" --format '{{.Names}}' | grep -v -- '-init' || true)
    if [ "${#RUSTFS_CONTAINERS[@]}" -eq 0 ]; then
        echo "error: no running RustFS container found. Start the stack, or pass --network NAME." >&2
        exit 1
    fi
    if [ "${#RUSTFS_CONTAINERS[@]}" -gt 1 ]; then
        echo "error: several RustFS containers are running, so the network is ambiguous:" >&2
        printf '  %s\n' "${RUSTFS_CONTAINERS[@]}" >&2
        echo "Pass --network NAME to choose one." >&2
        exit 1
    fi
    NETWORK="$(docker inspect "${RUSTFS_CONTAINERS[0]}" \
        --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' | awk '{print $1}')"
    test -n "$NETWORK" || { echo "error: could not determine the network for ${RUSTFS_CONTAINERS[0]}" >&2; exit 1; }
fi

echo "Migrating MinIO -> RustFS on network '$NETWORK'"
echo "Buckets: $BUCKETS"
echo

docker run --rm \
    --network "$NETWORK" \
    -v "$INNER_SCRIPT:/mirror-to-rustfs.sh:ro" \
    --entrypoint /mirror-to-rustfs.sh \
    -e SRC_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}" \
    -e SRC_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}" \
    -e SRC_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}" \
    -e DST_ENDPOINT="${RUSTFS_ENDPOINT:-http://rustfs:9000}" \
    -e DST_ACCESS_KEY="${RUSTFS_ACCESS_KEY:-rustfsadmin}" \
    -e DST_SECRET_KEY="${RUSTFS_SECRET_KEY:-rustfsadmin}" \
    -e BUCKETS="$BUCKETS" \
    "${RC_IMAGE:-rustfs/rc:v0.1.36}"
