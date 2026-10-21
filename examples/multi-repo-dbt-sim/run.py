import argparse
import contextlib
import http.client
import http.cookiejar
import json
import os
import re
import shlex
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from generate import model_schema
from tooling import CommandError, build, check_load, command, load_env, serve_git

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
SCENARIOS = {
    "baseline": ("server", "Ring, shared upstream, mixed refs and joins compile"),
    "ambiguity": (
        "server",
        "One-argument-only reference fails with a clear ambiguity error",
    ),
    "unreadable": (
        "server",
        "Refresh fails as a whole; pending isolation work keeps last-good explores",
    ),
    "empty-selector": ("server", "Empty selection fails before #31283"),
    "warn-error": (
        "server",
        "NoNodesForSelectionCriteria fails unless explicitly suppressed",
    ),
    "collision": (
        "server",
        "Newcomer renames both explores; pending naming work preserves original",
    ),
    "duplicate-project": ("server", "Duplicate dbt project names fail early"),
    "versioned": ("server", "Pinned/latest refs may require an extra cold parse"),
    "scale": ("server", "Many sources compile; record Git discovery count and timing"),
    "cli-deploy": (
        "cli",
        "Sequential full deploys can erase sibling explores before reworked #31326",
    ),
    "cli-source": (
        "cli",
        "Explicit-source diagnostic control; not the normal CLI workflow",
    ),
    "config-none": (
        "cli",
        "Missing parameters/categories still erase project configuration",
    ),
    "config-partial": (
        "cli",
        "Partial configuration still replaces project configuration",
    ),
    "cli-join": ("cli", "Record whether the cross-repo join fails or is dropped"),
    "cli-join-connected": (
        "cli",
        "Loom resolves upstream refs; record whether an already deployed upstream preserves the join",
    ),
    "cli-join-unconnected": (
        "cli",
        "Loom resolves upstream refs without registering the upstream; record join and explore availability",
    ),
    "server-join": (
        "server",
        "Refresh resolves the same cross-repo join and exposes the upstream model",
    ),
    "cli-collision": (
        "cli",
        "Capture collision status and guidance; #31326 adds HTTP 409",
    ),
    "cli-duplicate-project": (
        "cli",
        "Record source inference for duplicate dbt project names",
    ),
    "refresh-after-cli": ("server", "Refresh removes CLI-only explores"),
    "dbt19-server": ("server", "Project-wide dbt 1.9 compile succeeds"),
    "dbt19-cli": ("cli", "Repo compiled with dbt 1.9 deploys"),
}


def operation_messages(operation):
    messages = []
    for step in operation.get("status", {}).get("steps") or []:
        if step.get("stepError"):
            messages.append(step["stepError"])
        for log in step.get("stepDbtLogs") or []:
            if log.get("info", {}).get("level") == "error":
                messages.append(log["info"]["msg"])
    for event in operation.get("http_errors", []):
        messages.append(
            f"HTTP {event['http_status']}: {event.get('message', event.get('body'))}"
        )
    output = operation.get("output", "")
    if output and not operation.get("success"):
        messages.append(output)
    else:
        messages.extend(
            line
            for line in output.splitlines()
            if 'Join "' in line or "--source" in line
        )
    return list(dict.fromkeys(messages))


def write_summary(result, directory):
    rows = [
        f"Baseline revision: `{result['code_sha']}`. Scale: `{result['scale']}`. Seed: `{result['seed']}`.",
        "",
        "| Scenario | Mode | Before → after | Last operation | Passes | Parameters / tags / groups |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    details = []
    for row in result["results"]:
        operations = row["operations"]
        last = operations[-1] if operations else {}
        outcome = (
            row.get("skipped")
            or row.get("harness_error")
            or ("success" if last.get("success") else "failure")
        )
        before = (
            row.get("before", {})
            if row["scenario"]
            in ("baseline", "scale", "server-join", "cli-join-unconnected")
            else row.get("baseline", {})
        )
        before = row.get("upstream_deployed", before)
        after = row.get("after", {})
        config_counts = "/".join(
            str(len(after.get(key) or {}))
            for key in ("parameters", "spotlight_tags", "table_groups")
        )
        rows.append(
            f"| {row['scenario']} | {row['mode']} | {before.get('total_explores', '?')} → {after.get('total_explores', '?')} | {outcome.replace('|', '/').replace(chr(10), ' ')[:160]} | {last.get('passes')} | {config_counts} |"
        )
        section = [
            f"<details><summary>{row['scenario']}</summary>",
            "",
            row["expected"],
            "",
            f"Connection mode: `{after.get('connection_mode')}`. API route: `{after.get('connection_route')}`.",
            "",
            "| Source | Before | After |",
            "| --- | --- | --- |",
        ]
        earlier = before.get("explores_per_source", {})
        later = after.get("explores_per_source", {})
        for source in sorted(set(earlier) | set(later)):
            section.append(
                f"| {source} | {earlier.get(source, 0)} | {later.get(source, 0)} |"
            )
        section += [
            "",
            "| Operation | Success | ms | Passes | Git discovery requests | HTTP 409 | Recommends --source |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for operation in operations:
            label = operation["operation"] + (
                " " + operation["source"] if operation.get("source") else ""
            )
            if operation.get("before"):
                label += f" ({operation['before']['total_explores']} → {operation['after']['total_explores']})"
            section.append(
                f"| {label} | {operation.get('success')} | {operation.get('elapsed_ms')} | {operation.get('passes')} | {operation.get('git_discovery_requests')} | {operation.get('http_409', False)} | {operation.get('guidance_recommends_source', False)} |"
            )
        section += [
            "",
            "Project config after:",
            "",
            "```json",
            json.dumps(
                {
                    key: after.get(key)
                    for key in (
                        "parameters",
                        "spotlight_tags",
                        "table_groups",
                        "defaults",
                    )
                },
                indent=2,
            ),
            "```",
            "",
        ]
        for key in ("healthy_addition_visible", "original_source_preserved"):
            if key in row:
                section.append(f"{key}: `{row[key]}`.")
        if "original_chart" in row:
            section.append(
                f"Original chart created: `{row['original_chart']['created']}`. Original query resolves before/after: `{row.get('original_query_before', {}).get('resolves')}` / `{row.get('original_query_after', {}).get('resolves')}`."
            )
        if row.get("warehouse_probe"):
            section.append(
                f"Warehouse probe resolves: `{row['warehouse_probe']['resolves']}`. Rows: `{row['warehouse_probe'].get('row_count')}`."
            )
        if "join_observation" in row:
            section += [
                "",
                "Join observation:",
                "",
                "```json",
                json.dumps(row["join_observation"], indent=2),
                "```",
            ]
        messages = list(
            dict.fromkeys(
                message
                for operation in operations
                for message in operation_messages(operation)
            )
        )
        if messages:
            section += [
                "",
                "Errors and guidance:",
                "",
                "```text",
                "\n\n".join(messages),
                "```",
            ]
        section += ["", "</details>"]
        details.append("\n".join(section))
    (Path(directory) / "SUMMARY.md").write_text(
        "\n".join(rows) + "\n\n" + "\n\n".join(details) + "\n"
    )


def read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (ValueError, OSError) as error:
        raise RuntimeError(f"Cannot read JSON: {Path(path).name}") from error


class ApiError(RuntimeError):
    def __init__(self, status, payload):
        self.status = status
        self.payload = payload
        super().__init__(json.dumps(payload))


class Api:
    def __init__(self, url, env):
        parsed = urllib.parse.urlsplit(url)
        if parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("This fixture accepts loopback development instances only")
        self.url = url.rstrip("/")
        self.token = env.get("LIGHTDASH_API_KEY", "")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.events = []
        if not self.token:
            self.call(
                "POST",
                "/api/v1/login",
                {
                    "email": env["SIM_EMAIL"],
                    "password": env["SIM_PASSWORD"],
                },
            )

    def call(self, method, path, body=None):
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Lightdash synthetic fixture",
        }
        if self.token:
            headers["Authorization"] = "ApiKey " + self.token
        request = urllib.request.Request(
            self.url + path,
            method=method,
            headers=headers,
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            with self.opener.open(request, timeout=120) as response:
                payload = json.loads(response.read() or b"{}")
                return payload.get("results")
        except urllib.error.HTTPError as error:
            raw = error.read().decode(errors="replace")
            try:
                payload = json.loads(raw)
            except ValueError:
                payload = {"message": raw}
            self.events.append({"http_status": error.code, "body": payload})
            raise ApiError(error.code, payload) from None


def sanitise(value, env):
    if isinstance(value, dict):
        return {key: sanitise(item, env) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitise(item, env) for item in value]
    if not isinstance(value, str):
        return value
    text = value
    for key, secret in env.items():
        if (
            secret
            and len(secret) > 3
            and re.search(
                r"(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY)$", key, re.IGNORECASE
            )
        ):
            text = text.replace(secret, "<redacted>")
    text = re.sub(
        r"\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b",
        "<id>",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    return text


@contextlib.contextmanager
def observe_cli_http(url):
    target = urllib.parse.urlsplit(url)
    events = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def forward(self):
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size)
            headers = {
                key: value
                for key, value in self.headers.items()
                if key.lower() not in ("host", "connection", "transfer-encoding")
            }
            connection_class = (
                http.client.HTTPSConnection
                if target.scheme == "https"
                else http.client.HTTPConnection
            )
            connection = connection_class(target.hostname, target.port, timeout=120)
            try:
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                raw = response.read()
                if response.status >= 400:
                    events.append(
                        {
                            "http_status": response.status,
                            "method": self.command,
                            "path": self.path,
                            "message": raw.decode(errors="replace"),
                        }
                    )
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in (
                        "content-length",
                        "transfer-encoding",
                        "connection",
                    ):
                        self.send_header(key, value)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            finally:
                connection.close()

        do_GET = forward
        do_POST = forward
        do_PUT = forward
        do_PATCH = forward
        do_DELETE = forward

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", events
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@contextlib.contextmanager
def trust_local_git(server):
    key = f"http.https://localhost:{server.port}/.sslCAInfo"
    previous = subprocess.run(
        ["git", "config", "--system", "--get-all", key],
        capture_output=True,
        text=True,
        check=False,
    )
    if previous.returncode not in (0, 1) or previous.stdout:
        raise RuntimeError("Local Git trust key is unavailable or already owned")
    command(
        ["git", "config", "--system", key, str(server.cert_path)],
        CHECKOUT,
        dict(os.environ),
        10,
    )
    try:
        yield
    finally:
        subprocess.run(
            ["git", "config", "--system", "--unset-all", key],
            capture_output=True,
            check=True,
        )


class Runner:
    def __init__(self, args, env, root, server):
        self.args, self.env, self.root, self.server = args, env, root, server
        self.registry = read_json(root / "registry.json")
        self.sources = self.registry["sources"]
        self.api = Api(args.url, env)
        self.created_token = None
        if not self.api.token:
            token = self.api.call(
                "POST",
                "/api/v1/user/me/personal-access-tokens",
                {
                    "description": "Synthetic multi-repo fixture",
                    "expiresAt": None,
                    "autoGenerated": False,
                },
            )
            self.api.token = token["token"]
            self.created_token = token["uuid"]
        self.env = {**env, "LIGHTDASH_API_KEY": self.api.token}
        self.state_path = root / "state.json"
        self.state = read_json(self.state_path) if self.state_path.exists() else {}
        if self.state.get("url") not in (None, args.url):
            raise ValueError("Use a separate --out directory for a different instance")
        self.state["url"] = args.url
        self.state.setdefault("projects", {})
        result_path = root / "results/results.json"
        self.results = (
            read_json(result_path).get("results", []) if result_path.exists() else []
        )
        self.log_paths = []
        instance = env.get("LD_INSTANCE_ID")
        if instance:
            self.log_paths = list(
                (Path.home() / ".pm2/logs").glob(
                    f"{instance.replace('_', '-')}-api-*.log"
                )
            )

    def close(self):
        if self.created_token:
            self.api.call(
                "DELETE", "/api/v1/user/me/personal-access-tokens/" + self.created_token
            )

    def save_state(self):
        self.state_path.write_text(json.dumps(self.state, indent=2) + "\n")
        self.state_path.chmod(0o600)

    def source_config(self, name, selector=None):
        config = {
            "type": "github",
            "authorization_method": "personal_access_token",
            "personal_access_token": "",
            "repository": f"sim/{name}",
            "branch": "main",
            "project_sub_path": "/",
            "host_domain": f"localhost:{self.server.port}",
        }
        if selector:
            config["selector"] = selector
        if name == "growth":
            config["environment"] = [{"key": "DBT_VERSION_CHECK", "value": "false"}]
        return config

    def warehouse(self):
        return {
            "type": "postgres",
            "host": self.env["PGHOST"],
            "port": int(self.env["PGPORT"]),
            "dbname": self.env["PGDATABASE"],
            "user": self.env["PGUSER"],
            "password": self.env["PGPASSWORD"],
            "schema": "sim",
            "sslmode": "disable",
        }

    def project(self, scenario, mode, sources=None, version="v1.12"):
        selected = sources or [source["name"] for source in self.sources]
        key = f"{mode}-{scenario}"
        supplied = (
            self.args.server_project if mode == "server" else self.args.cli_project
        )
        if supplied and len(self.args.scenarios) != 1:
            raise ValueError("An explicit project target requires exactly one scenario")
        existing = supplied or self.state["projects"].get(key)
        config = (
            self.source_config(selected[0]) if mode == "server" else {"type": "none"}
        )
        body = {
            "name": f"Synthetic {self.args.scale} {key}",
            "type": "DEFAULT",
            "dbtVersion": version,
            "dbtConnection": config,
            "warehouseConnection": self.warehouse(),
        }
        pending = None
        if existing:
            pending = self.api.call("PATCH", f"/api/v1/projects/{existing}", body)
            project = existing
        else:
            created = self.api.call("POST", "/api/v1/org/projects", body)
            project = created["project"]["projectUuid"]
            self.state["projects"][key] = project
            self.save_state()
        current = self.api.call("GET", f"/api/v1/projects/{project}/dbt-sources")
        for source in current:
            if not source["isPrimary"]:
                self.api.call(
                    "DELETE",
                    f"/api/v1/projects/{project}/dbt-sources/{source['projectDbtSourceUuid']}",
                )
        for name in selected[1:] if mode == "server" else selected:
            self.api.call(
                "POST",
                f"/api/v1/projects/{project}/dbt-sources",
                {
                    "name": name,
                    "dbtConnection": self.source_config(name),
                },
            )
        if pending and pending.get("jobUuid"):
            deadline = time.monotonic() + self.args.timeout
            while time.monotonic() < deadline:
                status = self.api.call("GET", f"/api/v1/jobs/{pending['jobUuid']}")
                if status["jobStatus"] in ("DONE", "ERROR"):
                    break
                time.sleep(2)
            else:
                raise TimeoutError("Project setup exceeded scenario timeout")
        return project

    def snapshot(self, project):
        sources = self.api.call("GET", f"/api/v1/projects/{project}/dbt-sources")
        names = {s["projectDbtSourceUuid"]: s["name"] for s in sources}
        names.update({s["name"]: s["name"] for s in sources})
        explores = self.api.call("GET", f"/api/v1/projects/{project}/explores")
        if isinstance(explores, dict):
            explores = explores.get("explores", list(explores.values()))
        counts = Counter({s["name"]: 0 for s in sources})
        schema_sources = {f"sim_{s['name']}": s["name"] for s in self.sources}
        primary = next(s for s in sources if s["isPrimary"])
        primary_name = (
            "growth"
            if "sim_growth" in schema_sources and len(sources) == 1
            else "payments"
        )
        schema_sources[f"sim_{primary_name}"] = primary["name"]
        for schema in {explore.get("schemaName") for explore in explores}:
            sample = next(
                explore for explore in explores if explore.get("schemaName") == schema
            )
            try:
                detail = self.api.call(
                    "GET",
                    f"/api/v1/projects/{project}/explores/{urllib.parse.quote(sample['name'])}",
                )
                table = detail.get("tables", {}).get(detail.get("baseTable"), {})
                identity = table.get("dbtSourceUuid")
                if identity in names:
                    schema_sources[schema] = names[identity]
            except ApiError:
                pass
        errors, explore_names = [], []
        for explore in explores:
            explore_names.append(explore["name"])
            identity = explore.get("dbtSourceUuid") or explore.get("dbtSourceName")
            counts[
                names.get(
                    identity,
                    schema_sources.get(explore.get("schemaName"), "unattributed"),
                )
            ] += 1
            if explore.get("errors"):
                errors.append({"name": explore["name"], "errors": explore["errors"]})
        config = {}
        for key, path in [
            ("parameters", "v2/projects/{p}/parameters"),
            ("spotlight_tags", "v1/projects/{p}/tags"),
            ("table_groups", "v1/projects/{p}/table-groups"),
            ("defaults", "v2/projects/{p}/defaults"),
        ]:
            try:
                config[key] = self.api.call("GET", "/api/" + path.format(p=project))
            except ApiError as error:
                config[key] = {"unavailable": error.status, "error": error.payload}
        detail = self.api.call("GET", f"/api/v1/projects/{project}")
        return {
            "explores_per_source": dict(counts),
            "total_explores": len(explores),
            "explore_names": sorted(explore_names),
            "explore_errors": errors,
            "connection_route": detail.get("connectionRoute"),
            **config,
            "connection_mode": self.connection_mode(project),
        }

    def connection_mode(self, project):
        if self.args.target != "current":
            return None
        try:
            import psycopg2
        except ImportError:
            return None
        try:
            with (
                psycopg2.connect(
                    host=self.env["PGHOST"],
                    port=self.env["PGPORT"],
                    dbname=self.env.get("PGDATABASE_APP", self.env["PGDATABASE"]),
                    user=self.env["PGUSER"],
                    password=self.env["PGPASSWORD"],
                ) as db,
                db.cursor() as cursor,
            ):
                cursor.execute(
                    "select connection_mode from projects where project_uuid = %s",
                    (project,),
                )
                row = cursor.fetchone()
                return row[0] if row else None
        except psycopg2.Error:
            return None

    def refresh(self, project):
        check_load()
        offsets = {p: p.stat().st_size for p in self.log_paths}
        started = time.monotonic()
        discovers = self.server.clone_count
        job = self.api.call("POST", f"/api/v1/projects/{project}/refresh")
        job_id = job["jobUuid"] if "jobUuid" in job else job["jobId"]
        deadline = started + self.args.timeout
        status = {}
        while time.monotonic() < deadline:
            status = self.api.call("GET", f"/api/v1/jobs/{job_id}")
            if status["jobStatus"].lower() not in (
                "running",
                "pending",
                "queued",
                "scheduled",
                "started",
            ):
                break
            time.sleep(2)
        else:
            raise TimeoutError("Refresh exceeded scenario timeout")
        logs = ""
        for path, offset in offsets.items():
            with path.open() as stream:
                stream.seek(offset)
                logs += stream.read()
        metrics = []
        for line in logs.splitlines():
            try:
                event = json.loads(line[line.index("{") :])
            except ValueError:
                continue
            if (
                event.get("projectUuid") == project
                and event.get("event") == "dbt.compile.crossSourceRefsResolved"
            ):
                metrics.append(event)
        return {
            "operation": "refresh",
            "success": status.get("jobStatus", "").lower()
            in ("done", "completed", "success"),
            "status": status,
            "elapsed_ms": round((time.monotonic() - started) * 1000),
            "git_discovery_requests": self.server.clone_count - discovers,
            "passes": metrics[-1].get("passes") if metrics else None,
            "resolver_metrics": metrics,
            "guidance_recommends_source": "--source" in json.dumps(status),
        }

    def deploy(self, project, name, source=False):
        check_load()
        started = time.monotonic()
        executable = (
            self.args.dbt19 if name == "growth" and self.args.dbt19 else self.args.dbt
        )
        env = {
            **self.env,
            "LIGHTDASH_URL": self.args.url,
            "LIGHTDASH_PROJECT": project,
            "PATH": str(Path(executable).resolve().parent)
            + os.pathsep
            + self.env["PATH"],
            "CI": "true",
            "DBT_SEND_ANONYMOUS_USAGE_STATS": "false",
            "DBT_PARTIAL_PARSE": "false",
        }
        argv = [
            *shlex.split(self.args.cli),
            "deploy",
            "--project",
            project,
            "--project-dir",
            str(self.root / "repos" / name),
            "--profiles-dir",
            str(self.root / "profiles"),
            "--profile",
            "multi_repo_sim",
            "--target",
            "dev",
            "--target-path",
            "target",
            "--assume-yes",
            "--use-batched-deploy",
        ]
        if source:
            argv += ["--source", name]
        with observe_cli_http(self.args.url) as (proxy, events):
            env["LIGHTDASH_URL"] = proxy
            try:
                result = command(
                    argv, self.root / "repos" / name, env, self.args.timeout
                )
                code, output = 0, result.stdout + result.stderr
            except CommandError as error:
                code, output = error.returncode, error.stdout + error.stderr
        return {
            "operation": "deploy",
            "source": name,
            "explicit_source": source,
            "success": code == 0,
            "exit_code": code,
            "output": output,
            "elapsed_ms": round((time.monotonic() - started) * 1000),
            "http_409": any(event["http_status"] == 409 for event in events),
            "guidance_recommends_source": "--source" in output,
            "http_errors": events,
        }

    def republish(self, name):
        from tooling import initialise_repos

        initialise_repos(self.root)
        command(
            [
                "git",
                "--git-dir",
                str(self.root / "remotes/sim" / (name + ".git")),
                "fetch",
                str(self.root / "repos" / name),
                "main:main",
            ],
            self.root,
            self.env,
        )

    @contextlib.contextmanager
    def edit(self, name, path, transform):
        file = self.root / "repos" / name / path
        original = file.read_text() if file.exists() else None
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(transform(original))
        self.republish(name)
        try:
            yield
        finally:
            if original is None:
                file.unlink()
            else:
                file.write_text(original)
            self.republish(name)

    @contextlib.contextmanager
    def add_model(self, source, model):
        sql = self.root / "repos" / source / "models" / f"{source}_base.sql"
        if not sql.exists():
            sql = self.root / "repos" / source / "models/ledger.sql"
        schema = json.dumps({"version": 2, "models": [model_schema(model)]})
        with (
            self.edit(source, f"models/{model}.sql", lambda _: sql.read_text()),
            self.edit(source, f"models/{model}.yml", lambda _: schema),
        ):
            check_load()
            command(
                [
                    self.args.dbt,
                    "--no-use-colors",
                    "--no-partial-parse",
                    "run",
                    "--project-dir",
                    str(self.root / "repos" / source),
                    "--profiles-dir",
                    str(self.root / "profiles"),
                    "--profile",
                    "multi_repo_sim",
                    "--target",
                    "dev",
                    "--target-path",
                    "target",
                    "--select",
                    model,
                    "--threads",
                    "1",
                ],
                self.root / "repos" / source,
                self.env,
                self.args.timeout,
            )
            yield

    def query(self, project, model="ledger", query=None):
        query = query or {
            "exploreName": model,
            "dimensions": [f"{model}_id", f"{model}_label"],
            "metrics": [],
            "filters": {},
            "sorts": [],
            "limit": 10,
            "tableCalculations": [],
        }
        try:
            result = self.api.call(
                "POST",
                f"/api/v1/projects/{project}/explores/{model}/compileQuery",
                query,
            )
            rows = self.api.call(
                "POST", f"/api/v1/projects/{project}/explores/{model}/runQuery", query
            )
            return {
                "resolves": True,
                "compiled": result,
                "row_count": len(rows["rows"]),
                "labels": [
                    row[dimension]["value"]["raw"]
                    for row in rows["rows"]
                    for dimension in query["dimensions"]
                    if dimension.endswith("_label")
                ],
            }
        except ApiError as error:
            return {
                "resolves": False,
                "http_status": error.status,
                "error": error.payload,
            }

    def chart(self, project, model="ledger"):
        query = {
            "exploreName": model,
            "dimensions": [f"{model}_id", f"{model}_label"],
            "metrics": [],
            "filters": {},
            "sorts": [],
            "limit": 10,
            "tableCalculations": [],
        }
        try:
            result = self.api.call(
                "POST",
                f"/api/v1/projects/{project}/saved",
                {
                    "name": "Synthetic original ledger",
                    "tableName": model,
                    "metricQuery": query,
                    "chartConfig": {"type": "table", "config": {}},
                    "tableConfig": {"columnOrder": [f"{model}_id", f"{model}_label"]},
                },
            )
            return {"created": True, "chart": result.get("uuid"), "query": query}
        except ApiError as error:
            return {"created": False, "error": error.payload}

    def saved_chart_query(self, project, chart):
        if not chart.get("created"):
            return {"resolves": False, "error": "The original chart was not created"}
        try:
            saved = self.api.call("GET", f"/api/v1/saved/{chart['chart']}")
            model = saved["tableName"]
            query = {**saved["metricQuery"], "exploreName": model}
            return {"saved_explore_name": model, **self.query(project, model, query)}
        except ApiError as error:
            return {
                "resolves": False,
                "http_status": error.status,
                "error": error.payload,
            }

    def scenario(self, name):
        mode, expected = SCENARIOS[name]
        operations = []
        record = {
            "scenario": name,
            "mode": mode,
            "expected": expected,
            "operations": operations,
        }
        self.results = [row for row in self.results if row["scenario"] != name]
        self.results.append(record)
        print(f"SCENARIO {name}", flush=True)
        try:
            check_load()
            selected = None
            if name == "dbt19-server":
                selected = [
                    "growth",
                    *[
                        source["name"]
                        for source in self.sources
                        if source["name"] != "growth"
                    ],
                ]
            elif name == "dbt19-cli":
                selected = ["growth"]
            elif name == "collision":
                selected = [
                    source["name"]
                    for source in self.sources
                    if source["name"] != "marketing"
                ]
            elif name in ("cli-join-connected", "server-join"):
                selected = ["payments", "merchants"]
            elif name == "cli-join-unconnected":
                selected = ["payments"]
            project = self.project(
                name, mode, selected, "v1.9" if name == "dbt19-server" else "v1.12"
            )
            record["before"] = self.snapshot(project)
            if name == "cli-join-connected":
                operations.append(self.deploy(project, "merchants"))
                record["upstream_deployed"] = self.snapshot(project)
            if name.startswith("dbt19-") and not self.args.dbt19:
                record["skipped"] = "No separate dbt 1.9 executable supplied"
                return
            if mode == "server":
                operations.append(self.refresh(project))
            else:
                operations.append(
                    self.deploy(
                        project, "growth" if name == "dbt19-cli" else "payments"
                    )
                )
            record["baseline"] = self.snapshot(project)
            if name == "baseline":
                record["warehouse_probe"] = self.query(project)
            if name in ("baseline", "versioned", "scale", "dbt19-server"):
                if name == "versioned":
                    operations.append(self.refresh(project))
            elif name == "ambiguity":
                path = "models/merchant_settlement_report.sql"
                with self.edit(
                    "finance", path, lambda _: "select 1 as id, 1::numeric as amount\n"
                ):
                    operations.append(self.refresh(project))
            elif name == "unreadable":
                with self.add_model("payments", "healthy_addition"):
                    self.server.unreadable.add("marketing")
                    try:
                        operations.append(self.refresh(project))
                        record["healthy_addition_visible"] = (
                            "healthy_addition"
                            in self.snapshot(project)["explore_names"]
                        )
                    finally:
                        self.server.unreadable.discard("marketing")
            elif name in ("empty-selector", "warn-error"):
                source = next(
                    s
                    for s in self.api.call(
                        "GET", f"/api/v1/projects/{project}/dbt-sources"
                    )
                    if s["name"] == "marketing"
                )
                config = self.source_config("marketing", "tag:sim_missing_tag")
                self.api.call(
                    "PATCH",
                    f"/api/v1/projects/{project}/dbt-sources/{source['projectDbtSourceUuid']}",
                    {"dbtConnection": config},
                )
                if name == "warn-error":
                    with self.edit(
                        "marketing",
                        "dbt_project.yml",
                        lambda s: (
                            s
                            + "\nflags:\n  warn_error_options:\n    error: [NoNodesForSelectionCriteria]\n"
                        ),
                    ):
                        operations.append(self.refresh(project))
                        config["environment"] = [
                            {"key": "DBT_WARN_ERROR_OPTIONS", "value": '{"error": []}'}
                        ]
                        self.api.call(
                            "PATCH",
                            f"/api/v1/projects/{project}/dbt-sources/{source['projectDbtSourceUuid']}",
                            {"dbtConnection": config},
                        )
                        operations.append(self.refresh(project))
                else:
                    operations.append(self.refresh(project))
            elif name in ("collision", "cli-collision"):
                record["original_chart"] = self.chart(project)
                record["original_query_before"] = self.saved_chart_query(
                    project, record["original_chart"]
                )
                with self.add_model("marketing", "ledger"):
                    if mode == "server":
                        self.api.call(
                            "POST",
                            f"/api/v1/projects/{project}/dbt-sources",
                            {
                                "name": "marketing",
                                "dbtConnection": self.source_config("marketing"),
                            },
                        )
                    operations.append(
                        self.refresh(project)
                        if mode == "server"
                        else self.deploy(project, "marketing")
                    )
                    record["original_query_after"] = self.saved_chart_query(
                        project, record["original_chart"]
                    )
                    record["original_source_preserved"] = (
                        record["original_query_after"]["resolves"]
                        and record["original_query_before"]
                        .get("compiled", {})
                        .get("query")
                        == record["original_query_after"]
                        .get("compiled", {})
                        .get("query")
                        and record["original_query_before"].get("labels")
                        == record["original_query_after"].get("labels")
                    )
            elif name in ("duplicate-project", "cli-duplicate-project"):
                with self.edit(
                    "marketing",
                    "dbt_project.yml",
                    lambda s: re.sub(
                        r"(?m)^([ \t]+)marketing:$",
                        r"\1growth:",
                        re.sub(r"(?m)^name:.*$", "name: growth", s),
                    ),
                ):
                    operations.append(
                        self.refresh(project)
                        if mode == "server"
                        else self.deploy(project, "marketing")
                    )
                    if mode == "cli":
                        sources = self.api.call(
                            "GET", f"/api/v1/projects/{project}/dbt-sources"
                        )
                        source_names = {
                            source["projectDbtSourceUuid"]: source["name"]
                            for source in sources
                        }
                        detail = self.api.call(
                            "GET", f"/api/v1/projects/{project}/explores/campaign"
                        )
                        table = detail.get("tables", {}).get(
                            detail.get("baseTable"), {}
                        )
                        source_id = table.get("dbtSourceUuid")
                        record["cli_source_inference"] = {
                            "dbt_project_name": "growth",
                            "model_repo": "marketing",
                            "source_marker_present": source_id is not None,
                            "assigned_source": source_names.get(source_id),
                        }
                        record["warehouse_probe"] = self.query(project, "campaign")
            elif name in ("cli-deploy", "cli-source"):
                for source in self.sources:
                    if source["name"] != "payments":
                        before = self.snapshot(project)
                        operations.append(
                            {
                                **self.deploy(
                                    project, source["name"], name == "cli-source"
                                ),
                                "before": before,
                                "after": self.snapshot(project),
                            }
                        )
            elif name in ("config-none", "config-partial"):
                operations.append(
                    self.deploy(
                        project, "growth" if name == "config-none" else "marketing"
                    )
                )
            elif name in (
                "cli-join",
                "cli-join-connected",
                "cli-join-unconnected",
                "server-join",
            ):
                try:
                    record["joined_explore"] = self.api.call(
                        "GET", f"/api/v1/projects/{project}/explores/payments"
                    )
                    explore = record["joined_explore"]
                    last = operations[-1]
                    record["join_observation"] = {
                        "upstream_registered": name != "cli-join-unconnected",
                        "compile_and_deploy_success": last["success"],
                        "compile_success": last["success"]
                        if mode == "server"
                        else bool(
                            re.search(
                                r"Compiled \d+ explores,.*ERRORS=0",
                                last.get("output", ""),
                            )
                        ),
                        "deploy_success": last["success"] if mode == "cli" else None,
                        "joined_tables": explore.get("joinedTables", []),
                        "join_present": "merchant" in explore.get("tables", {})
                        and bool(explore.get("joinedTables")),
                        "upstream_explore_before": "merchant"
                        in record.get("upstream_deployed", record["before"])[
                            "explore_names"
                        ],
                        "upstream_explore_after": "merchant"
                        in self.snapshot(project)["explore_names"],
                        "messages": operation_messages(last),
                    }
                    if mode == "cli":
                        manifest_path = (
                            self.root / "repos/payments/target/manifest.json"
                        )
                        if manifest_path.exists():
                            nodes = read_json(manifest_path).get("nodes", {})
                            record["join_observation"][
                                "loom_upstream_model_in_manifest"
                            ] = "model.merchants.merchant" in nodes
                            record["join_observation"][
                                "downstream_depends_on_upstream"
                            ] = "model.merchants.merchant" in nodes.get(
                                "model.payments.payments", {}
                            ).get("depends_on", {}).get("nodes", [])
                except ApiError as error:
                    record["join_error"] = error.payload
            elif name == "refresh-after-cli":
                with self.add_model("payments", "cli_only"):
                    operations.append(self.deploy(project, "payments"))
                    record["after_cli"] = self.snapshot(project)
                operations.append(self.refresh(project))
            record["after"] = self.snapshot(project)
        except (KeyboardInterrupt, SystemExit):
            record["harness_error"] = "Run interrupted before the scenario completed"
            raise
        except (
            ApiError,
            CommandError,
            OSError,
            ValueError,
            RuntimeError,
            TimeoutError,
            KeyError,
        ) as error:
            record["harness_error"] = str(error)
        finally:
            self.write_results()
            print(
                f"RESULT {name}: {'harness error' if record.get('harness_error') else 'recorded'}",
                flush=True,
            )

    def write_results(self):
        result = sanitise(
            {
                "code_sha": self.args.code_sha,
                "target_sha": self.args.target_sha
                or (self.args.code_sha if self.args.target == "current" else None),
                "scale": self.args.scale,
                "seed": self.args.seed,
                "fixture_stats": self.registry.get("stats"),
                "results": self.results,
            },
            self.env,
        )
        directory = self.root / "results"
        directory.mkdir(exist_ok=True)
        (directory / "results.json").write_text(json.dumps(result, indent=2) + "\n")
        write_summary(result, directory)


def main():
    parser = argparse.ArgumentParser(
        description="Run synthetic multi-repo dbt scenarios on a local development instance."
    )
    parser.add_argument("--target", choices=["current", "url"], default="current")
    parser.add_argument("--url")
    parser.add_argument(
        "--target-sha",
        help="Source revision of an externally supplied instance/CLI build",
    )
    parser.add_argument("--server-project")
    parser.add_argument("--cli-project")
    parser.add_argument("--scale", choices=["small", "full"], default="small")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--dbt", default=str(ROOT / ".work/venvs/dbt12/bin/dbt"))
    parser.add_argument("--dbt19", default=None)
    parser.add_argument(
        "--cli", default=f"node {CHECKOUT / 'packages/cli/dist/index.js'}"
    )
    parser.add_argument(
        "--scenarios", nargs="+", choices=list(SCENARIOS), default=list(SCENARIOS)
    )
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--timeout", type=int, default=1200)
    args = parser.parse_args()
    if args.build_only and args.skip_build:
        parser.error("--build-only cannot be combined with --skip-build")
    if args.target == "url" and not args.url:
        parser.error("--target url requires --url")
    for key in ("dbt", "dbt19"):
        value = getattr(args, key)
        if value and "/" in value:
            setattr(args, key, str(Path(value).resolve()))
    if args.timeout > 1800 or args.timeout < 10:
        parser.error("--timeout must be between 10 and 1800 seconds")
    env = load_env(CHECKOUT)
    if env.get("PGHOST") not in ("localhost", "127.0.0.1", "::1"):
        parser.error("The fixture requires the local development Postgres warehouse")
    args.code_sha = command(
        ["git", "rev-parse", "HEAD"], CHECKOUT, env, 10
    ).stdout.strip()
    if not args.url:
        status = json.loads(
            command(
                [str(Path.home() / ".ldenv/bin/ldenv"), "status", "--json"],
                CHECKOUT,
                env,
                30,
            ).stdout
        )
        if not status.get("ready"):
            parser.error("Run ldenv wait before this runner")
        args.url = f"http://127.0.0.1:{status['ports']['api']}"
    root = (args.out or ROOT / ".work" / args.scale).resolve()
    env["PGDATABASE_APP"] = env["PGDATABASE"]
    env["PGDATABASE"] = env.get("DBT_DATABASE", env["PGDATABASE"])
    if not args.skip_build or not (root / "registry.json").exists():
        command(
            [
                sys.executable,
                str(ROOT / "generate.py"),
                "--scale",
                args.scale,
                "--seed",
                str(args.seed),
                "--out",
                str(root),
            ],
            CHECKOUT,
            env,
        )
    registry = read_json(root / "registry.json")
    if (registry.get("scale"), registry.get("seed"), registry.get("variant")) != (
        args.scale,
        args.seed,
        "baseline",
    ):
        parser.error(
            "The existing fixture does not match this scale/seed/baseline; rerun without --skip-build"
        )
    if not args.skip_build:
        check_load()
        result = build(
            root, dbt=args.dbt, dbt19=args.dbt19, full=args.scale == "full", env=env
        )
        (root / "build.json").write_text(
            json.dumps(sanitise(result, env), indent=2) + "\n"
        )
        if result["exit_code"]:
            print("Warehouse build failed; inspect the redacted build.json", flush=True)
            return 1
    if args.build_only:
        return 0
    with serve_git(root) as server, trust_local_git(server):
        runner = Runner(args, env, root, server)
        try:
            for scenario in args.scenarios:
                runner.scenario(scenario)
        finally:
            runner.close()
    return int(any(r.get("harness_error") for r in runner.results))


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(130))
    raise SystemExit(main())
