import contextlib
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import threading
from pathlib import Path
from urllib.parse import urlsplit

from large_org_build import _owned, _status

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
HELPER = ROOT / "large_org_observer.cjs"
POINTS = {"sourceFetchComplete", "sourceFetchFailed"}


def _configuration(runtime):
    if not isinstance(runtime, dict) or any(
        not isinstance(runtime.get(key), dict) for key in ("build", "status", "env")
    ):
        raise ValueError("invalid_runtime")
    build = runtime["build"]
    revision = build["revision"]
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("invalid_build")
    api = Path(build["api"])
    expected = ROOT / ".work/large-org/builds" / revision / ".runtime/api.cjs"
    if api != expected or api.resolve(strict=True) != expected:
        raise ValueError("invalid_bundle")
    status = runtime["status"]
    port = status["inspector_port"]
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("invalid_inspector_port")
    env = runtime["env"]
    identity = "ldenv_" + hashlib.sha256(str(CHECKOUT).encode()).hexdigest()[:16]
    if env.get("LD_INSTANCE_ID") != identity:
        raise ValueError("instance_mismatch")
    target = urlsplit(runtime["target"])
    if (
        target.scheme != "http"
        or target.hostname != "127.0.0.1"
        or target.username
        or target.password
        or target.path not in ("", "/")
        or target.query
        or target.fragment
        or target.port is None
        or str(target.port) != str(env.get("PORT"))
        or target.port == port
        or status.get("api_url") != runtime["target"]
        or status.get("revision") != revision
    ):
        raise ValueError("runtime_mismatch")
    live_status = _status()
    owned = _owned(live_status, env)
    candidates = [
        item
        for item in owned
        if item["name"].endswith("-api")
        and item["pm2_env"].get("pm_exec_path") == str(api)
        and item["pm2_env"].get("status") == "online"
    ]
    if (
        len(candidates) != 1
        or live_status["ports"].get("debug") != port
        or type(candidates[0].get("pid")) is not int
        or candidates[0]["pid"] <= 0
    ):
        raise ValueError("owned_api_mismatch")
    return {"api": str(api), "port": port, "pid": candidates[0]["pid"]}


def _observation(value):
    if not isinstance(value, dict) or set(value) != {
        "projectUuid",
        "diskEvictions",
        "diskRecreations",
        "point",
    }:
        raise ValueError("invalid_observation")
    if (
        not isinstance(value["projectUuid"], str)
        or not value["projectUuid"]
        or not isinstance(value["point"], str)
        or value["point"] not in POINTS
        or any(
            type(value[key]) is not int or not 0 <= value[key] <= 2**53 - 1
            for key in ("diskEvictions", "diskRecreations")
        )
    ):
        raise ValueError("invalid_observation")
    return dict(value)


class DiskPoolObservations:
    def __init__(self):
        self._events = []
        self._lock = threading.Lock()
        self._started = threading.Event()
        self._ready = False
        self._closed = False
        self._reason = None
        self._process = None
        self._reader = None

    def _unavailable(self, reason):
        with self._lock:
            if self._reason is None:
                self._reason = reason
        self._started.set()

    @property
    def available(self):
        with self._lock:
            return self._ready and self._reason is None

    @property
    def reason(self):
        with self._lock:
            if self._reason is not None:
                return self._reason
            if not self._events:
                return "no_observations" if self._ready else "not_ready"
            return None

    @property
    def events(self):
        return self.read()

    def read(self):
        with self._lock:
            return [dict(event) for event in self._events]

    def _collect(self):
        try:
            for line in self._process.stdout:
                if line == "ready\n":
                    with self._lock:
                        if self._ready:
                            raise ValueError("duplicate_ready")
                        self._ready = True
                    self._started.set()
                    continue
                value = json.loads(line)
                if isinstance(value, dict) and set(value) == {"unavailable"}:
                    reason = value["unavailable"]
                    self._unavailable(
                        reason
                        if isinstance(reason, str)
                        and reason
                        in {
                            "stats_unavailable",
                            "inspector_disconnected",
                            "invalid_inspector_message",
                            "parent_disconnected",
                            "ready_timeout",
                            "lifetime_exceeded",
                            "observer_unavailable",
                            "unsupported_bundle",
                            "node_24_required",
                            "discovery_failed",
                            "target_mismatch",
                            "pid_unavailable",
                            "pid_mismatch",
                            "connection_failed",
                            "script_mismatch",
                            "breakpoint_unavailable",
                            "breakpoint_location_mismatch",
                            "inspector_request_failed",
                            "inspector_timeout",
                        }
                        else "observer_unavailable"
                    )
                    continue
                event = _observation(value)
                with self._lock:
                    self._events.append(event)
        except (ValueError, TypeError, OSError):
            self._unavailable("invalid_observer_output")
        finally:
            if not self._closed:
                self._unavailable("observer_exited")
            self._started.set()

    def _start(self, runtime):
        try:
            config = _configuration(runtime)
            node = shutil.which("node")
            if node is None:
                self._unavailable("node_unavailable")
                return
            self._process = subprocess.Popen(
                [node, str(HELPER)],
                cwd=CHECKOUT,
                env={"PATH": os.environ.get("PATH", "")},
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                start_new_session=True,
            )
            self._reader = threading.Thread(target=self._collect, daemon=True)
            self._reader.start()
            self._process.stdin.write(json.dumps(config) + "\n")
            self._process.stdin.flush()
            if not self._started.wait(timeout=10):
                self._unavailable("ready_timeout")
            if not self.available:
                self.close()
        except (KeyError, ValueError, TypeError, OSError):
            self._unavailable("invalid_runtime_or_observer_unavailable")
            self.close()

    def close(self):
        self._closed = True
        process = self._process
        if process is not None:
            if process.poll() is None:
                try:
                    process.send_signal(signal.SIGINT)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
                    self._unavailable("observer_cleanup_timeout")
            if self._reader is not None:
                self._reader.join(timeout=2)
                if self._reader.is_alive():
                    self._unavailable("observer_reader_timeout")
            if process.returncode not in (None, 0):
                self._unavailable("observer_exited")
            process.stdin.close()
            process.stdout.close()


@contextlib.contextmanager
def observe_disk_pool(runtime):
    observations = DiskPoolObservations()
    try:
        observations._start(runtime)
        yield observations
    finally:
        observations.close()
