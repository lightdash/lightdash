import contextlib
import fcntl
import hashlib
import io
import json
import os
import re
import shutil
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from tooling import check_load, command, load_env

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
WORK = ROOT / ".work"
BUILDS = WORK / "large-org" / "builds"
HELPER = ROOT / "large_org_build.cjs"
LDENV = "/root/.ldenv/bin/ldenv"
PACKAGES = ("backend", "common", "formula", "warehouses")


def _run(argv, env=None, cwd=CHECKOUT, timeout=1800):
    if not 0 < timeout <= 1800:
        raise ValueError("Command timeout must be between 1 and 1800 seconds")
    return command(argv, cwd, dict(os.environ) if env is None else env, timeout)


def _json(text):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        raise RuntimeError("Expected a valid JSON response") from None


def _write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def _load_check():
    with contextlib.redirect_stdout(io.StringIO()):
        check_load()


def _node():
    executable = shutil.which("node")
    if not executable:
        raise RuntimeError("Node is unavailable")
    major = _run([executable, "-p", "process.versions.node.split('.')[0]"], timeout=10)
    if int(major.stdout.strip()) < 24:
        raise RuntimeError("Node 24 or later is required")
    return executable


@contextlib.contextmanager
def _lock(name):
    directory = WORK / "large-org"
    if not _inside(directory, CHECKOUT):
        raise RuntimeError("Fixture work directory escaped this checkout")
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / name).open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another fixture operation holds the lock") from None
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _inside(path, parent):
    return Path(path).resolve().is_relative_to(parent.resolve())


def _validate_build(build):
    revision = build.get("revision", "")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Build revision must be a full commit SHA")
    archive = BUILDS / revision
    if archive.is_symlink() or Path(build["root"]) != archive:
        raise ValueError("Build must belong to this fixture")
    if not _inside(archive, CHECKOUT):
        raise ValueError("Build directory must stay inside this checkout")
    if _json((archive / "build.json").read_text()) != build:
        raise RuntimeError("Build metadata does not match the prepared archive")
    for relative, expected in build["artifacts"].items():
        artifact = archive / relative
        if not _inside(artifact, archive) or artifact.is_symlink():
            raise RuntimeError("Build artifact escaped its archive")
        if hashlib.sha256(artifact.read_bytes()).hexdigest() != expected:
            raise RuntimeError("A prepared build artifact changed")
    return archive


def prepare_build(sha):
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-fA-F]{7,40}", sha):
        raise ValueError("Provide a commit SHA, rather than a branch or tag")
    kind = _run(["git", "cat-file", "-t", sha], timeout=30).stdout.strip()
    if kind != "commit":
        raise ValueError("Source object must be a commit")
    revision = _run(["git", "rev-parse", "--verify", sha], timeout=30).stdout.strip()
    tree = _run(["git", "rev-parse", revision + "^{tree}"], timeout=30).stdout.strip()
    with _lock("build.lock"):
        archive = BUILDS / revision
        if not _inside(archive, CHECKOUT) or archive.is_symlink():
            raise RuntimeError("Archive directory escaped this checkout")
        tar = BUILDS / (revision + ".tar")
        if (archive / "build.json").is_file():
            build = _json((archive / "build.json").read_text())
            _validate_build(build)
            return build
        _load_check()
        if archive.exists():
            marker = archive / "SOURCE_REVISION"
            if not marker.is_file() or marker.read_text().strip() != revision:
                raise RuntimeError("An incomplete archive needs parent review")
            with tarfile.open(tar) as source:
                if source.pax_headers.get("comment") != revision:
                    raise RuntimeError("The source archive has a different revision")
            for relative in ("", *("packages/" + name for name in PACKAGES)):
                modules = archive / relative / "node_modules"
                if modules.exists():
                    if modules.is_symlink():
                        raise RuntimeError("An archive dependency directory is shared")
                    modules.rename(
                        modules.with_name(
                            "node_modules.superseded-" + str(time.time_ns())
                        )
                    )
        else:
            archive.mkdir(parents=True)
            if tar.exists() or tar.is_symlink():
                raise RuntimeError("An existing source archive needs parent review")
            _run(["git", "archive", "--format=tar", "--output", str(tar), revision])
            with tarfile.open(tar) as source:
                source.extractall(archive, filter="data")
            (archive / "SOURCE_REVISION").write_text(revision + "\n")
        node = _node()
        _run([node, HELPER, "dependencies", CHECKOUT, archive])
        if (archive / ".external/package.json").exists():
            _load_check()
            firewall = shutil.which("sfw")
            if firewall is None:
                raise RuntimeError(
                    "Socket Firewall is required for private dependency installs"
                )
            _run(
                [
                    firewall,
                    "pnpm",
                    "--dir",
                    archive / ".external",
                    "install",
                    "--ignore-scripts",
                    "--no-frozen-lockfile",
                ]
            )
        _run([node, HELPER, "link", CHECKOUT, archive])
        _load_check()
        _run([node, HELPER, "build", CHECKOUT, archive])
        details = _json((archive / ".runtime" / "packages-build.json").read_text())
        artifacts = {}
        for directory in (
            archive / ".runtime",
            *(archive / "packages" / name / "dist" for name in PACKAGES[1:]),
        ):
            for path in sorted(directory.rglob("*")):
                if path.is_file() and not path.is_symlink() and _inside(path, archive):
                    artifacts[str(path.relative_to(archive))] = hashlib.sha256(
                        path.read_bytes()
                    ).hexdigest()
        build = {
            "revision": revision,
            "tree": tree,
            "root": str(archive),
            "api": str(archive / ".runtime" / "api.cjs"),
            "archive": str(tar),
            "archive_sha256": hashlib.sha256(tar.read_bytes()).hexdigest(),
            "builder_sha256": hashlib.sha256(HELPER.read_bytes()).hexdigest(),
            "backend_builder_sha256": hashlib.sha256(
                (CHECKOUT / "scripts/ldenv/backend-bundle.cjs").read_bytes()
            ).hexdigest(),
            "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "packages": details,
            "artifacts": artifacts,
        }
        if ".runtime/api.cjs" not in artifacts:
            raise RuntimeError("Backend builder did not produce an API bundle")
        _write_json(archive / "build.json", build)
        return build


def _status():
    status = _json(
        _run([LDENV, "--worktree", CHECKOUT, "status", "--json"], timeout=60).stdout
    )
    if (
        not isinstance(status, dict)
        or Path(status.get("worktree", "")).resolve() != CHECKOUT
    ):
        raise RuntimeError("ldenv status does not belong to this checkout")
    expected = "ldenv_" + hashlib.sha256(str(CHECKOUT).encode()).hexdigest()[:16]
    if status.get("id") != expected:
        raise RuntimeError("ldenv identity does not match this checkout")
    ports = status.get("ports") or {}
    if any(
        type(ports.get(key)) is not int or not 1024 <= ports[key] <= 65535
        for key in ("api", "frontend")
    ):
        raise RuntimeError("ldenv did not report valid local ports")
    return status


def _prefix(status, env):
    home = Path(env.get("LDENV_HOME", str(Path.home() / ".ldenv"))).resolve()
    namespace = ""
    if home != (Path.home() / ".ldenv").resolve():
        namespace = re.sub(
            r"[^a-z0-9]+",
            "_",
            re.sub(r"^\.ldenv-?", "", home.name, flags=re.IGNORECASE).lower(),
        ).strip("_")
        if not namespace or len(namespace) > 32:
            raise RuntimeError("Unsupported ldenv namespace")
        namespace += "-"
    return namespace + status["id"] + "-"


def _pm2(args, env=None):
    return _run(
        [_node(), CHECKOUT / "node_modules/pm2/bin/pm2", *args], env=env, timeout=60
    )


def _pm2_inventory(output):
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\[", output):
        try:
            candidate, _ = decoder.raw_decode(output[match.start() :])
        except ValueError:
            continue
        if isinstance(candidate, list) and all(
            isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and isinstance(item.get("pm2_env"), dict)
            for item in candidate
        ):
            return candidate
    raise RuntimeError("PM2 did not report a valid process inventory")


def _owned(status, env):
    inventory = _pm2_inventory(_pm2(["jlist"], env).stdout)
    prefix = _prefix(status, env)
    owned = [item for item in inventory if item.get("name", "").startswith(prefix)]
    for item in owned:
        cwd = item.get("pm2_env", {}).get("pm_cwd")
        if not cwd or not _inside(cwd, CHECKOUT):
            raise RuntimeError("An owned PM2 name points outside this checkout")
    return owned


def _get_json(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "Synthetic build fixture"}
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status != 200:
                raise RuntimeError("Local API did not return success")
            return _json(response.read())
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError("Local API is unavailable") from None


def _wait_health(url, name, env, archive):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        status = _status()
        api = [item for item in _owned(status, env) if item["name"] == name]
        if (
            len(api) != 1
            or Path(api[0]["pm2_env"].get("pm_exec_path", ""))
            != archive / ".runtime/api.cjs"
        ):
            raise RuntimeError("The pinned API process was replaced unexpectedly")
        try:
            _get_json(url + "/api/v1/health")
            if api[0]["pm2_env"].get("status") == "online":
                return
        except RuntimeError:
            pass
        time.sleep(1)
    raise RuntimeError("Pinned API health check timed out")


def _flag_evidence(url, flag_enabled):
    evidence = {}
    for flag, expected in (
        ("multi-dbt-sources", True),
        ("cross-source-dbt-refs", flag_enabled),
    ):
        result = _get_json(url + "/api/v2/feature-flag/" + flag).get("results", {})
        if result.get("id") != flag or result.get("enabled") is not expected:
            raise RuntimeError("Feature flag API did not confirm the requested state")
        evidence[flag] = {"enabled": expected, "evidence": "api"}
    return evidence


def _shim(dbt=None):
    executable = Path(dbt) if dbt is not None else WORK / "venvs/dbt12/bin/dbt"
    executable = executable.resolve(strict=True)
    if not _inside(executable, WORK / "venvs"):
        raise ValueError("The selected dbt must belong to a private fixture venv")
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise RuntimeError("The selected private dbt executable is unavailable")
    identity = hashlib.sha256(str(executable).encode()).hexdigest()[:16]
    directory = WORK / "dbt-bin" / identity
    if not _inside(directory, CHECKOUT):
        raise RuntimeError("Private shim directory escaped this checkout")
    directory.mkdir(parents=True, exist_ok=True)
    for name in ("dbt1.12", "dbt"):
        link = directory / name
        if link.is_symlink():
            if link.resolve() != executable.resolve():
                raise RuntimeError("The private dbt shim has a different target")
        elif link.exists():
            raise RuntimeError("The private dbt shim path is occupied")
        else:
            link.symlink_to(executable)
    return directory


def _server_toolchain(api, expected):
    pid = api["pid"]
    values = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    actual_path = next(
        value.split(b"=", 1)[1].decode()
        for value in values
        if value.startswith(b"PATH=")
    )
    resolved = {}
    for name in ("dbt1.12", "dbt"):
        executable = shutil.which(name, path=actual_path)
        if executable is None or Path(executable).resolve() != expected.resolve():
            raise RuntimeError("The live API PATH resolves a different dbt executable")
        resolved[name] = str(Path(executable).resolve())
    python = expected.parent / "python"
    versions = _json(
        _run(
            [
                python,
                "-c",
                "import importlib.metadata as m,json; packages={d.metadata['Name'].lower():d.version for d in m.distributions()}; print(json.dumps({p:packages.get(p) for p in ('dbt-core','dbt-postgres','dbt-loom')}))",
            ],
            timeout=30,
        ).stdout
    )
    return {
        "executable": str(expected.resolve()),
        "versions": versions,
        "live_api_path_resolution": resolved,
        "evidence": "live API process environment and selected venv package metadata",
    }


def _start_canonical(env):
    if env.get("LDENV_STANDALONE_SCHEDULER") == "true":
        raise RuntimeError(
            "Parent must start this instance without a standalone scheduler"
        )
    for filename in (".env.development", ".env.development.local"):
        source = CHECKOUT / filename
        if source.exists() and re.search(
            r"^\s*(?:export\s+)?(?:NODE_OPTIONS|MULTI_REPO_SIM_DISABLE_SCHEDULER)\s*=",
            source.read_text(),
            re.MULTILINE,
        ):
            raise RuntimeError("Parent must review canonical-start preload overrides")
    guarded = dict(os.environ)
    for key in ("LDENV_HOME", "LDENV_PG_PORT", "PM2_HOME"):
        if key in env:
            guarded[key] = env[key]
    guarded["MULTI_REPO_SIM_DISABLE_SCHEDULER"] = "1"
    guarded["NODE_OPTIONS"] = (
        env.get("NODE_OPTIONS", "") + " --require " + str(HELPER)
    ).strip()
    _load_check()
    _run([LDENV, "--worktree", CHECKOUT, "start"], env=guarded)


def _start_build(build, flag_enabled, dbt=None):
    archive = _validate_build(build)
    if type(flag_enabled) is not bool:
        raise ValueError("flag_enabled must be a boolean")
    env = load_env(CHECKOUT)
    status = _status()
    owned = _owned(status, env)
    name = _prefix(status, env) + "api"
    api = [item for item in owned if item["name"] == name]
    if not api or api[0]["pm2_env"].get("status") != "online":
        _start_canonical(env)
        status = _status()
        owned = _owned(status, env)
        api = [item for item in owned if item["name"] == name]
    if len(api) != 1:
        raise RuntimeError("Could not identify the original owned API supervisor")
    live = api[0]["pm2_env"]
    original = live.get("env") or {}
    env.update(
        {key: value for key, value in original.items() if isinstance(value, str)}
    )
    for key in (
        "PORT",
        "FE_PORT",
        "PGHOST",
        "PGPORT",
        "PGUSER",
        "PGPASSWORD",
        "PGDATABASE",
        "LD_INSTANCE_ID",
        "PATH",
    ):
        if isinstance(live.get(key), str):
            env[key] = live[key]
    if (
        str(env.get("PORT")) != str(status["ports"]["api"])
        or env.get("LD_INSTANCE_ID") != status["id"]
    ):
        raise RuntimeError("Original API environment does not match the owned instance")
    env.update(
        PORT=str(status["ports"]["api"]),
        FE_PORT=str(status["ports"]["frontend"]),
        DBT_SOURCE_FETCH_DISK_BUDGET_BYTES="3221225472",
        DBT_SOURCE_FETCH_CONCURRENCY="4",
        LIGHTDASH_LOG_CONSOLE_FORMAT="json",
        LIGHTDASH_ENABLE_FEATURE_FLAGS="multi-dbt-sources"
        + (",cross-source-dbt-refs" if flag_enabled else ""),
        LIGHTDASH_DISABLE_FEATURE_FLAGS=",".join(
            sorted(
                (
                    {
                        item.strip()
                        for item in env.get(
                            "LIGHTDASH_DISABLE_FEATURE_FLAGS", ""
                        ).split(",")
                        if item.strip()
                    }
                    - {"multi-dbt-sources", "cross-source-dbt-refs"}
                )
                | (set() if flag_enabled else {"cross-source-dbt-refs"})
            )
        ),
        LIGHTDASH_PREVIEW_FEATURE_FLAGS_ENABLED="false",
        SCHEDULER_ENABLED="true",
        LDENV_WORKTREE=str(archive),
        LDENV_BACKEND="bundle",
        NODE_PATH=os.pathsep.join(
            str(archive / directory)
            for directory in ("packages/backend/node_modules", "node_modules")
        ),
    )
    shim = _shim(dbt)
    env["PATH"] = str(shim) + os.pathsep + env.get("PATH", os.defpath)
    temporary = (
        WORK / "large-org/tmp" / build["revision"] / ("on" if flag_enabled else "off")
    )
    temporary.mkdir(parents=True, exist_ok=True)
    env["TMPDIR"] = str(temporary)
    env["NODE_OPTIONS"] = "--enable-source-maps"
    env.pop("NODE_ENV_FILE", None)
    _load_check()
    status = _status()
    for item in _owned(status, env):
        if item["name"].endswith("-scheduler"):
            _pm2(["stop", item["name"]], env)
    _owned(_status(), env)
    _pm2(["delete", name], env)
    if any(item["name"] == name for item in _owned(_status(), env)):
        raise RuntimeError("Original API supervisor did not stop")
    config = archive / ".runtime" / "pinned.ecosystem.config.cjs"
    config.write_text(
        "module.exports = {apps: ["
        + json.dumps(
            {
                "name": name,
                "script": str(archive / ".runtime/api.cjs"),
                "cwd": str(archive / "packages/backend"),
                "interpreter": _node(),
                "node_args": [
                    "--enable-source-maps",
                    f"--inspect=127.0.0.1:{status['ports']['debug']}",
                ],
                "watch": False,
                "autorestart": False,
                "kill_timeout": 10000,
                "env": {"SCHEDULER_ENABLED": "true", "LDENV_BACKEND": "bundle"},
            }
        )
        + "]};\n"
    )
    _pm2(["start", str(config), "--only", name], env)
    url = "http://127.0.0.1:" + str(status["ports"]["api"])
    _wait_health(url, name, env, archive)
    for item in _owned(_status(), env):
        if (
            item["name"].endswith("-scheduler")
            and item["pm2_env"].get("status") == "online"
        ):
            raise RuntimeError("An owned standalone scheduler is still running")
    evidence = _flag_evidence(url, flag_enabled)
    api = next(item for item in _owned(_status(), env) if item["name"] == name)
    toolchain = _server_toolchain(api, (shim / "dbt").resolve())
    runtime = {
        "revision": build["revision"],
        "api_url": url,
        "frontend_url": "http://127.0.0.1:" + str(status["ports"]["frontend"]),
        "flags": evidence,
        "scheduler_enabled": True,
        "inspector_port": status["ports"]["debug"],
        "dbt_toolchain": toolchain,
    }
    _write_json(archive / ".runtime" / "last-run.json", runtime)
    return {"target": url, "env": env, "status": runtime, "build": build}


def stop_owned_instance():
    with _lock("instance.lock"):
        _stop_owned_instance()


def _stop_owned_instance():
    env = load_env(CHECKOUT)
    status = _status()
    _owned(status, env)
    _run([LDENV, "--worktree", CHECKOUT, "stop"], env=env, timeout=120)
    if _owned(_status(), env):
        raise RuntimeError("Canonical ldenv stop left owned processes behind")


def start_build(build, flag_enabled, dbt=None):
    with _lock("instance.lock"):
        try:
            return _start_build(build, flag_enabled, dbt)
        except BaseException as error:
            _cleanup_after_error(error)
            raise


def _cleanup_after_error(error):
    try:
        _stop_owned_instance()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError):
        error.add_note("Canonical cleanup failed; parent must check the owned instance")


@contextlib.contextmanager
def running_build(build, flag_enabled, dbt=None):
    with _lock("instance.lock"):
        try:
            yield _start_build(build, flag_enabled, dbt)
        except BaseException as error:
            _cleanup_after_error(error)
            raise
        else:
            _stop_owned_instance()
