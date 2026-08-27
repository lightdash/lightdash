#!/usr/bin/env bash

set -uo pipefail

MODE="${1:-report}"
case "$MODE" in
    report|hook-start) ;;
    *)
        echo "Usage: $0 [report|hook-start]" >&2
        exit 1
        ;;
esac

if ! command -v python3 >/dev/null 2>&1; then
    [ "$MODE" = "hook-start" ] && exit 0
    echo "python3: unavailable"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY_DIR="${HOME:-}/.lightdash/dev-instances"

registry_present=false
if [ -d "$REGISTRY_DIR" ]; then
    for registry_file in "$REGISTRY_DIR"/*.json; do
        if [ -f "$registry_file" ]; then
            registry_present=true
            break
        fi
    done
fi

pm2_available=false
pm2_data="[]"
pm2_bin=""
if command -v pm2 >/dev/null 2>&1; then
    pm2_bin="$(command -v pm2)"
elif [ -x "$PROJECT_DIR/node_modules/.bin/pm2" ]; then
    pm2_bin="$PROJECT_DIR/node_modules/.bin/pm2"
fi

if [ -n "$pm2_bin" ]; then
    # pm2 jlist includes process environments, so reduce it before storing output.
    if pm2_data="$("$pm2_bin" jlist 2>/dev/null | python3 -c '
import json
import sys

services = (
    "api", "api-routes-watch", "scheduler", "frontend", "common-watch",
    "formula-watch", "warehouses-watch", "sdk-test", "maple",
)
processes = json.load(sys.stdin)
safe = []
for process in processes:
    name = str(process.get("name", ""))
    if not any(name.endswith("-" + service) for service in services):
        continue
    safe.append({
        "name": name,
        "memory": int(process.get("monit", {}).get("memory", 0) or 0),
        "status": str(process.get("pm2_env", {}).get("status", "")),
    })
json.dump(safe, sys.stdout, separators=(",", ":"))
')"; then
        pm2_available=true
    else
        pm2_data="[]"
    fi
fi

docker_reachable=false
docker_containers=""
if command -v docker >/dev/null 2>&1; then
    if docker_containers="$(docker ps --format '{{.Names}}\t{{.State}}' 2>/dev/null)"; then
        docker_reachable=true
        docker_containers="$(printf '%s\n' "$docker_containers" | awk -F '\t' '$1 ~ /^ld-/')"
    else
        docker_containers=""
    fi
fi

if [ "$MODE" = "hook-start" ] && [ "$registry_present" = false ] && [ -z "$docker_containers" ] && [ "$pm2_data" = "[]" ]; then
    exit 0
fi

docker_stats=""
docker_stats_available=false
if [ "$docker_reachable" = true ] && [ -n "$docker_containers" ]; then
    running_containers=()
    while IFS=$'\t' read -r container_name container_state; do
        [ -n "$container_name" ] || continue
        [ "$container_state" = "running" ] || continue
        running_containers+=("$container_name")
    done <<< "$docker_containers"
    if [ "${#running_containers[@]}" -gt 0 ]; then
        if docker_stats="$(docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' "${running_containers[@]}" 2>/dev/null)"; then
            docker_stats_available=true
        else
            docker_stats=""
        fi
    else
        docker_stats_available=true
    fi
fi

docker_volumes=""
docker_volumes_available=false
if [ "$docker_reachable" = true ]; then
    if docker_volumes="$(docker volume ls -q 2>/dev/null)"; then
        docker_volumes_available=true
        docker_volumes="$(printf '%s\n' "$docker_volumes" | awk '/^ld-/')"
    else
        docker_volumes=""
    fi
fi

current_root=""
if command -v git >/dev/null 2>&1; then
    current_root="$(git rev-parse --show-toplevel 2>/dev/null)" || current_root=""
fi

if [ "$MODE" = "hook-start" ]; then
    echo "Docker dev resource usage at session start — give the user a 1-2 line summary and mention they can ask you to clean up specific instances (stop/destroy/stop-all/gc):"
fi

PM2_DATA="$pm2_data" \
PM2_AVAILABLE="$pm2_available" \
DOCKER_REACHABLE="$docker_reachable" \
DOCKER_CONTAINERS="$docker_containers" \
DOCKER_STATS="$docker_stats" \
DOCKER_STATS_AVAILABLE="$docker_stats_available" \
DOCKER_VOLUMES="$docker_volumes" \
DOCKER_VOLUMES_AVAILABLE="$docker_volumes_available" \
python3 - "$REGISTRY_DIR" "$current_root" <<'PY'
import glob
import json
import os
import re
import sys

registry_dir, current_root = sys.argv[1:]
pm2_available = os.environ["PM2_AVAILABLE"] == "true"
docker_reachable = os.environ["DOCKER_REACHABLE"] == "true"
stats_available = os.environ["DOCKER_STATS_AVAILABLE"] == "true"
volumes_available = os.environ["DOCKER_VOLUMES_AVAILABLE"] == "true"


def format_bytes(value):
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(amount)} {unit}"
            return f"{amount:.1f} {unit}"
        amount /= 1024


def parse_memory(value):
    match = re.match(r"^\s*([0-9.]+)\s*([KMGT]?i?B)", value, re.IGNORECASE)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    factors = {
        "b": 1,
        "kb": 1000,
        "mb": 1000 ** 2,
        "gb": 1000 ** 3,
        "tb": 1000 ** 4,
        "kib": 1024,
        "mib": 1024 ** 2,
        "gib": 1024 ** 3,
        "tib": 1024 ** 4,
    }
    return int(amount * factors[unit])


instances = []
for path in glob.glob(os.path.join(registry_dir, "*.json")):
    try:
        with open(path) as registry_file:
            data = json.load(registry_file)
        instances.append({
            "id": str(data["instanceId"]),
            "slot": int(data["slot"]),
            "compose": str(data["composeProject"]),
            "worktree": str(data.get("worktreePath", "")),
            "ports": data.get("ports", {}),
        })
    except (OSError, ValueError, KeyError, TypeError):
        continue
instances.sort(key=lambda instance: (instance["slot"], instance["id"]))

try:
    pm2_processes = json.loads(os.environ["PM2_DATA"])
except (TypeError, ValueError):
    pm2_processes = []

containers = {}
for line in os.environ["DOCKER_CONTAINERS"].splitlines():
    name, _, state = line.partition("\t")
    if name:
        containers[name] = state

container_memory = {}
for line in os.environ["DOCKER_STATS"].splitlines():
    name, _, usage = line.partition("\t")
    parsed = parse_memory(usage)
    if name and parsed is not None:
        container_memory[name] = parsed

services = (
    "api", "api-routes-watch", "scheduler", "frontend", "common-watch",
    "formula-watch", "warehouses-watch", "sdk-test", "maple",
)

claimed_pm2_names = set()
for instance in instances:
    # Exact names, not a prefix match: instance "foo" must not claim "foo-bar-api".
    expected_names = {instance["id"] + "-" + service for service in services}
    processes = [process for process in pm2_processes if process["name"] in expected_names]
    claimed_pm2_names.update(process["name"] for process in processes)
    parts = [f'{instance["id"]}: slot {instance["slot"]}']
    if pm2_available:
        online = sum(process["status"] == "online" for process in processes)
        rss = sum(process["memory"] for process in processes)
        parts.append(f"PM2 {len(processes)} procs ({online} online)/{format_bytes(rss)}")
    if docker_reachable:
        postgres_name = instance["compose"] + "-db-dev-1"
        parts.append("postgres up" if containers.get(postgres_name) == "running" else "postgres down")
    else:
        parts.append("postgres n/a")
    line = "; ".join(parts)
    if current_root and os.path.realpath(instance["worktree"]) == os.path.realpath(current_root):
        line += " (this worktree)"
    print(line)

if docker_reachable:
    shared_count = sum(name.startswith("ld-shared-") for name in containers)
    print(f"shared services: {shared_count} ld-shared containers running")
else:
    print("docker: unreachable")

totals = []
if pm2_available:
    totals.append(f"PM2 RSS {format_bytes(sum(process['memory'] for process in pm2_processes))}")
if docker_reachable:
    running_count = len(containers)
    if stats_available and len(container_memory) == running_count:
        memory = format_bytes(sum(container_memory.values()))
    else:
        memory = "n/a"
    totals.append(f"containers {running_count} running/{memory}")
    if volumes_available:
        volumes = [name for name in os.environ["DOCKER_VOLUMES"].splitlines() if name]
        snapshots = sum("_postgres_data_snapshot" in name for name in volumes)
        totals.append(f"volumes {len(volumes)} ({snapshots} snapshots)")
    else:
        totals.append("volumes n/a")
if totals:
    print("totals: " + "; ".join(totals))

claimed_composes = [instance["compose"] for instance in instances]
orphan_pm2 = set()
for process in pm2_processes:
    if process["name"] in claimed_pm2_names:
        continue
    for service in services:
        suffix = "-" + service
        if process["name"].endswith(suffix):
            orphan_pm2.add(process["name"][:-len(suffix)])
            break

orphan_containers = []
for name in containers:
    if name.startswith("ld-shared-"):
        continue
    if not any(name.startswith(compose + "-") for compose in claimed_composes):
        orphan_containers.append(name)

orphans = []
if orphan_pm2:
    orphans.append("PM2 " + ", ".join(sorted(orphan_pm2)))
if orphan_containers:
    orphans.append("containers " + ", ".join(sorted(orphan_containers)))
if orphans:
    print("orphans: " + "; ".join(orphans))

print("/docker-dev stop (this instance) | /docker-dev destroy (instance + volumes) | /docker-dev stop-all | scripts/dev-ports.sh gc (orphaned slots/volumes)")
PY
