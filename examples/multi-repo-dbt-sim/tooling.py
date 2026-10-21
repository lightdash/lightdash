import contextlib
import json
import os
import re
import shutil
import signal
import ssl
import subprocess
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


class CommandError(RuntimeError):
    def __init__(self, result, timed_out=False):
        self.result = result
        self.returncode = result.returncode
        self.stdout = result.stdout
        self.stderr = result.stderr
        self.timed_out = timed_out
        super().__init__(
            "Command timed out"
            if timed_out
            else f"Command failed with exit code {result.returncode}"
        )


def _process(argv, cwd, env, timeout, body=None):
    with subprocess.Popen(
        [os.fspath(arg) for arg in argv],
        cwd=cwd,
        env=env,
        stdin=subprocess.PIPE if body is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    ) as process:
        try:
            stdout, stderr = process.communicate(body, timeout=timeout)
        except BaseException:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
            raise
        return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)


def command(argv, cwd, env, timeout=1800):
    try:
        result = _process(argv, cwd, env, timeout)
    except subprocess.TimeoutExpired:
        raise CommandError(
            subprocess.CompletedProcess([], -signal.SIGKILL, "", ""), True
        ) from None
    except OSError:
        raise RuntimeError("Command could not be started") from None
    result.stdout = result.stdout.decode("utf-8", errors="replace")
    result.stderr = result.stderr.decode("utf-8", errors="replace")
    if result.returncode:
        raise CommandError(result)
    return result


def load_env(checkout):
    env = dict(os.environ)
    pattern = re.compile(
        r"^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*"
        r"('(?:[^']*)'|\"(?:\\.|[^\"\\])*\"|[^\r\n]*)",
        re.MULTILINE,
    )
    for filename in (".env.development", ".env.development.local"):
        path = Path(checkout) / filename
        if not path.exists():
            continue
        for match in pattern.finditer(path.read_text()):
            key, value = match.groups()
            value = value.strip()
            single_quoted = value.startswith("'")
            if value.startswith(('"', "'")):
                quote = value[0]
                value = value[1:-1]
                if quote == '"':
                    value = re.sub(
                        r'\\([nrt"\\])',
                        lambda item: {
                            "n": "\n",
                            "r": "\r",
                            "t": "\t",
                            '"': '"',
                            "\\": "\\",
                        }[item[1]],
                        value,
                    )
            else:
                value = re.split(r"\s+#", value, maxsplit=1)[0].rstrip()
            if not single_quoted:
                value = re.sub(
                    r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}",
                    lambda item: env.get(item[1], ""),
                    value,
                )
            env[key] = value
    for pg, postgres, dbt in (
        ("PGHOST", "POSTGRES_HOST", "DBT_HOST"),
        ("PGPORT", "POSTGRES_PORT", "DBT_PORT"),
        ("PGUSER", "POSTGRES_USER", "DBT_USER"),
        ("PGPASSWORD", "POSTGRES_PASSWORD", "DBT_PASSWORD"),
        ("PGDATABASE", "POSTGRES_DB", "DBT_DATABASE"),
    ):
        if pg not in env and postgres in env:
            env[pg] = env[postgres]
        if pg in env:
            env[dbt] = env[pg]
    return env


def check_load():
    while True:
        for argv in (["uptime"], ["free", "-g"] if shutil.which("free") else ["vm_stat"]):
            print(
                command(argv, None, dict(os.environ), timeout=10).stdout.rstrip(),
                flush=True,
            )
        load = os.getloadavg()[0]
        if load <= 6:
            return load
        time.sleep(10)


def _sources(root):
    sources = json.loads((root / "registry.json").read_text())["sources"]
    names = [source["name"] for source in sources]
    if (
        not sources
        or len(set(names)) != len(names)
        or any(not re.fullmatch(r"[a-z][a-z0-9_-]*", name) for name in names)
    ):
        raise ValueError("Registry must contain unique synthetic source names")
    for name in names:
        repo = root / "repos" / name
        if (
            repo.is_symlink()
            or not repo.is_dir()
            or not repo.resolve().is_relative_to(root)
        ):
            raise ValueError("Source repository must be a directory inside the fixture")
    return sources


def initialise_repos(root):
    root = Path(root).resolve()
    env = dict(os.environ)
    signing = []
    parent = Path(__file__).resolve().parents[2]
    for key in (
        "user.signingkey",
        "gpg.format",
        "gpg.program",
        "gpg.ssh.program",
        "gpg.ssh.defaultKeyCommand",
        "gpg.ssh.allowedSignersFile",
    ):
        try:
            value = command(["git", "config", "--get", key], parent, env).stdout.strip()
        except CommandError as error:
            if error.returncode == 1:
                continue
            raise
        signing.extend(["-c", f"{key}={value}"])
    git = [
        "git",
        *signing,
        "-c",
        "commit.gpgsign=true",
        "-c",
        "user.name=Synthetic Fixture",
        "-c",
        "user.email=fixture@example.invalid",
    ]
    env.update(
        GIT_AUTHOR_NAME="Synthetic Fixture",
        GIT_AUTHOR_EMAIL="fixture@example.invalid",
        GIT_COMMITTER_NAME="Synthetic Fixture",
        GIT_COMMITTER_EMAIL="fixture@example.invalid",
    )
    changed = []
    for source in _sources(root):
        repo = root / "repos" / source["name"]
        if not (repo / ".git").exists():
            command([*git, "init", "--initial-branch=main"], repo, env)
        if (repo / ".git").is_symlink() or not (repo / ".git").is_dir():
            raise ValueError("Fixture repositories must have their own Git directory")
        command(
            [
                *git,
                "add",
                "-A",
                "--",
                ".",
                ":(exclude)target",
                ":(exclude)logs",
                ":(exclude)dbt_packages",
                ":(exclude).env*",
            ],
            repo,
            env,
        )
        try:
            command([*git, "diff", "--cached", "--quiet"], repo, env)
        except CommandError as error:
            if error.returncode != 1:
                raise
            command(
                [
                    *git,
                    "commit",
                    "-S",
                    "-m",
                    "Update synthetic dbt fixture",
                    "-m",
                    "Refs #31323\nRefs #31113",
                ],
                repo,
                env,
            )
            changed.append(source["name"])
        command([*git, "verify-commit", "HEAD"], repo, env)
    return changed


def _publish(root, source):
    manifest = root / "repos" / source["name"] / "target" / "manifest.json"
    destination = root / "published" / source["name"] / "manifest.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".json.tmp")
    shutil.copyfile(manifest, temporary)
    temporary.replace(destination)


def _safe_output(output, env):
    for key, value in env.items():
        if value and re.search(
            r"(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY)$", key, re.IGNORECASE
        ):
            output = output.replace(value, "<redacted>")
    output = re.sub(
        r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b",
        "<id>",
        output,
        flags=re.IGNORECASE,
    )
    return output[-8000:]


def _dbt_stage(root, source, dbt, dbt19, env, stage, action, arguments, result):
    executable = dbt19 if str(source["dbtVersion"]).startswith("1.9") and dbt19 else dbt
    started = time.monotonic()
    record = {"source": source["name"], "stage": stage, "elapsed_ms": 0, "exit_code": 0}
    try:
        command(
            [
                executable,
                "--no-use-colors",
                "--no-partial-parse",
                action,
                "--project-dir",
                str(root / "repos" / source["name"]),
                "--profile",
                "multi_repo_sim",
                "--target",
                "dev",
                "--target-path",
                "target",
                "--profiles-dir",
                str(root / "profiles"),
                *arguments,
            ],
            root / "repos" / source["name"],
            env,
        )
        if action in ("parse", "run"):
            _publish(root, source)
    except (CommandError, OSError, ValueError, RuntimeError) as error:
        record["exit_code"] = error.returncode if isinstance(error, CommandError) else 1
        message = (
            str(error) if isinstance(error, CommandError) else type(error).__name__
        )
        if isinstance(error, CommandError):
            message += "\n" + _safe_output(error.stdout + error.stderr, env)
        result["errors"].append(
            {"source": source["name"], "stage": stage, "error": message}
        )
    record["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    result["timings"].append(record)
    print(
        f"DBT {source['name']} {stage} exit={record['exit_code']} ms={record['elapsed_ms']}",
        flush=True,
    )
    return record["exit_code"] == 0


def _build(root, dbt, dbt19, full, env, materialise):
    root = Path(root).resolve()
    env = dict(os.environ) if env is None else dict(env)
    env.update(DBT_SEND_ANONYMOUS_USAGE_STATS="false", DBT_PARTIAL_PARSE="false")
    sources = _sources(root)
    started = time.monotonic()
    result = {
        "timings": [],
        "errors": [],
        "elapsed_ms": 0,
        "exit_code": 0,
        "full": full,
        "notes": [],
        "projects_total": len(sources),
        "projects_built": 0,
    }
    moved = []
    try:
        for source in sources:
            config = root / "repos" / source["name"] / "dbt_loom.config.yml"
            backup = config.with_name("dbt_loom.config.yml.sim-bootstrap")
            if backup.exists():
                raise RuntimeError(
                    "A previous bootstrap configuration needs restoration"
                )
            if config.exists():
                config.rename(backup)
                moved.append((config, backup))
        for source in sources:
            if not _dbt_stage(
                root,
                source,
                dbt,
                dbt19,
                env,
                "bootstrap_parse",
                "parse",
                ["--vars", "{sim_bootstrap: true}"],
                result,
            ):
                break
    finally:
        for config, backup in reversed(moved):
            backup.replace(config)
    if materialise and not result["errors"]:
        for source in sources:
            if not _dbt_stage(
                root,
                source,
                dbt,
                dbt19,
                env,
                "seed",
                "seed",
                ["--full-refresh", "--threads", "1"],
                result,
            ):
                break
        tagged = True
        for source in sources:
            manifest = json.loads(
                (root / "published" / source["name"] / "manifest.json").read_text()
            )
            tagged = tagged and any(
                node.get("package_name") == source["projectName"]
                and node.get("resource_type") == "model"
                and "sim_base" in node.get("tags", [])
                for node in manifest["nodes"].values()
            )
        if not tagged:
            result["notes"].append(
                "Bootstrap runs materialise fallback refs; normal runs replace them."
            )
        if not result["errors"]:
            for source in sources:
                arguments = (
                    ["--select", "tag:sim_base"]
                    if tagged
                    else ["--vars", "{sim_bootstrap: true}"]
                )
                if not _dbt_stage(
                    root,
                    source,
                    dbt,
                    dbt19,
                    env,
                    "bases" if tagged else "bootstrap_run",
                    "run",
                    [*arguments, "--full-refresh", "--threads", "1"],
                    result,
                ):
                    break
        if not result["errors"]:
            for source in sources:
                if not _dbt_stage(
                    root,
                    source,
                    dbt,
                    dbt19,
                    env,
                    "run",
                    "run",
                    ["--full-refresh", "--threads", "1"],
                    result,
                ):
                    break
                result["projects_built"] += 1
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    result["exit_code"] = 1 if result["errors"] else 0
    return result


def bootstrap(root, dbt="dbt1.12", dbt19=None, full=False, env=None):
    return _build(root, dbt, dbt19, full, env, False)


def build(root, dbt="dbt1.12", dbt19=None, full=False, env=None):
    return _build(root, dbt, dbt19, full, env, True)


@dataclass
class GitServer:
    port: int
    cert_path: Path
    clone_count: int = 0
    unreadable: set = field(default_factory=set)
    requests: list = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def url(self, name):
        if not re.fullmatch(r"[a-z][a-z0-9_-]*", name):
            raise ValueError("Invalid synthetic source name")
        return f"https://localhost:{self.port}/sim/{name}.git"


@contextlib.contextmanager
def serve_git(root, port=0):
    root = Path(root).resolve()
    sources = _sources(root)
    initialise_repos(root)
    env = dict(os.environ)
    remotes = root / "remotes" / "sim"
    remotes.mkdir(parents=True, exist_ok=True)
    work = root / ".work"
    work.mkdir(exist_ok=True)
    for source in sources:
        repo = root / "repos" / source["name"]
        remote = remotes / (source["name"] + ".git")
        if remote.is_symlink():
            raise ValueError("Bare remote cannot be a symbolic link")
        if remote.exists():
            command(
                [
                    "git",
                    "--git-dir",
                    str(remote),
                    "fetch",
                    "--prune",
                    str(repo),
                    "+refs/heads/*:refs/heads/*",
                    "+refs/tags/*:refs/tags/*",
                ],
                work,
                env,
            )
        else:
            command(
                ["git", "clone", "--bare", "--no-hardlinks", str(repo), str(remote)],
                work,
                env,
            )
    tls = root / "tls"
    tls.mkdir(mode=0o700, exist_ok=True)
    cert, key = tls / "cert.pem", tls / "key.pem"
    if cert.exists() != key.exists():
        raise RuntimeError("TLS certificate and key must both exist or both be absent")
    renew = not cert.exists()
    if not renew:
        try:
            command(
                ["openssl", "x509", "-checkend", "3600", "-noout", "-in", str(cert)],
                work,
                env,
                10,
            )
        except CommandError:
            renew = True
    if renew:
        command(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "7",
                "-keyout",
                str(key),
                "-out",
                str(cert),
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost,IP:127.0.0.1",
            ],
            work,
            env,
            60,
        )
    key.chmod(0o600)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    state = GitServer(port, cert)
    names = {source["name"] for source in sources}

    class Server(ThreadingHTTPServer):
        daemon_threads = False
        block_on_close = True

        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(15)
            try:
                return context.wrap_socket(connection, server_side=True), address
            except BaseException:
                connection.close()
                raise

        def handle_error(self, request, client_address):
            pass

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def _run(self):
            parsed = urlsplit(self.path)
            match = re.fullmatch(
                r"/sim/([a-z][a-z0-9_-]*)\.git/(info/refs|git-upload-pack)", parsed.path
            )
            if not match or match[1] not in names:
                self.send_error(403)
                return
            name, endpoint = match.groups()
            query = parse_qs(parsed.query)
            valid = (
                self.command == "GET"
                and endpoint == "info/refs"
                and query == {"service": ["git-upload-pack"]}
            ) or (
                self.command == "POST" and endpoint == "git-upload-pack" and not query
            )
            with state.lock:
                denied = name in state.unreadable or name + ".git" in state.unreadable
                if valid and endpoint == "info/refs":
                    state.clone_count += 1
                    state.requests.append({"source": name, "denied": denied})
            if not valid or denied:
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_error(400)
                return
            if (
                length < 0
                or length > 32 * 1024 * 1024
                or self.headers.get("Transfer-Encoding")
            ):
                self.send_error(413)
                return
            body = self.rfile.read(length)
            backend_env = {
                "PATH": env.get("PATH", "/usr/bin:/bin"),
                "GIT_PROJECT_ROOT": str(root / "remotes"),
                "GIT_HTTP_EXPORT_ALL": "1",
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "http.receivepack",
                "GIT_CONFIG_VALUE_0": "false",
                "REQUEST_METHOD": self.command,
                "PATH_INFO": parsed.path,
                "QUERY_STRING": parsed.query,
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": str(length),
                "REMOTE_ADDR": self.client_address[0],
            }
            if self.headers.get("Git-Protocol"):
                backend_env["GIT_PROTOCOL"] = self.headers["Git-Protocol"]
            try:
                result = _process(["git", "http-backend"], work, backend_env, 120, body)
            except (OSError, subprocess.TimeoutExpired):
                self.send_error(502)
                return
            header, separator, payload = result.stdout.partition(b"\r\n\r\n")
            if result.returncode or not separator:
                self.send_error(502)
                return
            status, headers = 200, []
            for line in header.decode("iso-8859-1").split("\r\n"):
                key_name, _, value = line.partition(":")
                if key_name.lower() == "status":
                    status = int(value.strip().split()[0])
                else:
                    headers.append((key_name, value.strip()))
            self.send_response(status)
            for key_name, value in headers:
                self.send_header(key_name, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        do_GET = _run
        do_POST = _run

    server = Server(("127.0.0.1", port), Handler)
    state.port = server.server_port
    thread = threading.Thread(
        target=server.serve_forever, name="sim-git-server", daemon=True
    )
    try:
        thread.start()
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
