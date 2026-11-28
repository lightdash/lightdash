#!/usr/bin/env python3
"""Install one scripted agent scenario on a preview's emulated model.

Run inside the guest from /usr/app (needs the env opted in to emulate-ai):
  python3 scripts/rainbow/emulate-ai-scenarios/scenario.py list
  python3 scripts/rainbow/emulate-ai-scenarios/scenario.py install <name>
  python3 scripts/rainbow/emulate-ai-scenarios/scenario.py run <name>
  python3 scripts/rainbow/emulate-ai-scenarios/scenario.py reset [--clean]

install rebuilds the fixtures, sets the scenario's composer-charts state,
loads <name>.json into the emulator and prints the prompt to send in the UI.
The editor persona has no access to Emulator private and view access only
to Emulator view only. run installs, then drives the turn through the API
as the scenario's persona, answers any SQL approval with its decision and
prints the tool calls and answer. reset restores the seed replies and the
flag; --clean also removes the fixtures and the scenario agent.

A file's rules fire once each, in order, keyed on tool names, never on
prompt text. The first loads the agent's full toolbox: fast decisions may
narrow the first step's tools by the prompt's intent.
"""
import json
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = "http://localhost:8080"
EMULATOR = "http://localhost:4014"
PAT = "ldpat_deadbeefdeadbeefdeadbeefdeadbeef"
PROJECT = "3675b69e-8324-4110-bdca-059031aa8da3"
AGENT_NAME = "Emulated scenarios agent"
SPACE = "Emulator scenarios"
PRIVATE_SPACE = "Emulator private"
VIEW_ONLY_SPACE = "Emulator view only"
DASHBOARD = "Emulator dashboard"
CREATED_SLUGS = ["emulator-created-payments", "emulator-node-payments"]
CLASSIC_SOURCE = "how-much-revenue-do-we-have-per-payment-method"
FLAG = "composer-charts"
PERSONAS = {
    "admin": "demo@lightdash.com",
    "editor": "demo2@lightdash.com",
}
PASSWORD = "demo_password!"  # the development seed's, public
SQL = (
    "SELECT payment_method, SUM(amount) AS total_amount "
    "FROM postgres.jaffle.payments GROUP BY 1"
)


class HttpError(Exception):
    pass


def call(method, url, body=None, auth=True, timeout=60):
    headers = {"Content-Type": "application/json"}
    if auth is True:
        headers["Authorization"] = f"ApiKey {PAT}"
    elif auth:
        headers["Cookie"] = auth
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data, headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode()
    except urllib.error.HTTPError as error:
        raise HttpError(f"{method} {url}: {error.code} {error.read().decode()[:400]}")
    try:
        return json.loads(text) if text else None
    except json.JSONDecodeError:
        return text  # an event stream


def app(method, path, body=None, auth=True, timeout=60):
    reply = call(method, APP + path, body, auth, timeout)
    return reply.get("results") if isinstance(reply, dict) else reply


def sign_in(persona):
    """A session as the persona; the secure cookie needs the proxy's https header."""
    request = urllib.request.Request(
        APP + "/api/v1/login",
        json.dumps({"email": PERSONAS[persona], "password": PASSWORD}).encode(),
        {"Content-Type": "application/json", "X-Forwarded-Proto": "https"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.headers["Set-Cookie"].split(";", 1)[0]


def emulator(method, path, body=None):
    return call(method, EMULATOR + path, body, auth=False)


def psql(query):
    return subprocess.check_output(
        ["runuser", "-u", "postgres", "--", "psql", "-d", "postgres", "-XAtc", query],
        text=True,
    ).strip()


def check_opt_in():
    pid = subprocess.check_output(
        ["systemctl", "show", "-p", "MainPID", "--value", "rainbow-dev.service"], text=True
    ).strip()
    env = dict(
        line.split("=", 1)
        for line in Path(f"/proc/{pid}/environ").read_text().split("\0")
        if "=" in line
    )
    if env.get("AI_DEFAULT_PROVIDER") != "openai" or "localhost:4014" not in env.get(
        "OPENAI_BASE_URL", ""
    ):
        sys.exit(
            "This env does not use the emulated model. Opt in first: set_env "
            '{AI_DEFAULT_PROVIDER: "openai", OPENAI_BASE_URL: "http://localhost:4014/v1"}'
        )


def set_flag(state):
    path = f"/api/v2/feature-flag/{FLAG}"
    if state == "default":
        try:
            app("DELETE", path)
        except HttpError:
            pass  # no override to drop
    else:
        app("POST", path, {"enabled": state == "on"})


def composer(owner, name, chart_config=None):
    chart = {
        "schemaVersion": 1,
        "columns": [
            {"reference": "payment_method", "fieldType": "dimension"},
            {"reference": "total_amount", "fieldType": "metric"},
        ],
        "chartConfig": chart_config
        or {
            "type": "cartesian",
            "config": {
                "layout": {"xField": "payment_method", "yField": ["total_amount"]},
                "eChartsConfig": {},
            },
        },
        "pivotConfig": None,
        "tableConfig": {"columnOrder": ["payment_method", "total_amount"]},
    }
    pipeline = {
        "schemaVersion": 1,
        "terminalNodeId": "payments",
        "nodes": [{"nodeId": "payments", "title": "Payments", "sourceType": "sql", "sql": SQL}],
    }
    body = {"dashboardUuid": None, **owner, "name": name, "description": None,
            "pipeline": pipeline, "chart": chart}
    return app("POST", f"/api/v2/projects/{PROJECT}/composer-charts", body)


def delete_space(space):
    app("DELETE", f"/api/v1/projects/{PROJECT}/spaces/{space['uuid']}")
    if app("GET", "/api/v1/health")["softDelete"]["enabled"]:
        app("DELETE", f"/api/v2/content/{PROJECT}/permanent",
            {"item": {"uuid": space["uuid"], "contentType": "space"}})


def remove_fixtures():
    for space in app("GET", f"/api/v1/projects/{PROJECT}/spaces"):
        if space["name"] in (SPACE, PRIVATE_SPACE, VIEW_ONLY_SPACE):
            delete_space(space)
    # Charts the agent saved elsewhere, e.g. a save to another space.
    for slug in CREATED_SLUGS:
        for uuid in psql(
            f"select composer_chart_uuid from composer_charts where project_uuid='{PROJECT}' "
            f"and slug like '{slug}%'"
        ).split():
            app("DELETE", f"/api/v2/projects/{PROJECT}/composer-charts/{uuid}")


def ensure_agent():
    body = {
        "projectUuid": PROJECT, "name": AGENT_NAME,
        "description": "Scripted by the emulated model; asks before running new SQL.",
        "integrations": [], "tags": None, "instruction": None, "imageUrl": None,
        "groupAccess": [], "userAccess": [], "spaceAccess": [],
        "enableDataAccess": True, "enableSelfImprovement": False,
        "enableContentTools": True, "enableSqlMode": True,
        "enableSqlAutoApproval": False, "enableComposerQueries": True,
        "version": 2,
    }
    for agent in app("GET", f"/api/v1/projects/{PROJECT}/aiAgents"):
        if agent["name"] == AGENT_NAME:
            app("PATCH", f"/api/v1/projects/{PROJECT}/aiAgents/{agent['uuid']}",
                {"uuid": agent["uuid"], **body})
            return agent["uuid"]
    return app("POST", f"/api/v1/projects/{PROJECT}/aiAgents", body)["uuid"]


def add_tiles(dashboard, charts):
    tiles = [{
        "type": "composer_chart", "x": 0, "y": 9 * i, "h": 9, "w": 12, "tabUuid": None,
        "properties": {"title": None, "composerChartUuid": chart, "chartName": None},
    } for i, chart in enumerate(charts)]
    app("PATCH", f"/api/v1/dashboards/{dashboard['uuid']}",
        {"tiles": tiles, "filters": dashboard["filters"], "tabs": dashboard["tabs"]})


def build_fixtures():
    remove_fixtures()
    ids = {"project": PROJECT, "agent": ensure_agent()}
    spaces = f"/api/v1/projects/{PROJECT}/spaces"
    space = app("POST", spaces, {"name": SPACE, "inheritParentPermissions": True})
    private = app("POST", spaces, {"name": PRIVATE_SPACE, "inheritParentPermissions": False})
    users = app("GET", "/api/v1/org/users?pageSize=100")["data"]
    editor = next(u for u in users if u["email"] == PERSONAS["editor"])
    view_only = app("POST", spaces, {
        "name": VIEW_ONLY_SPACE, "inheritParentPermissions": False,
        "access": [{"userUuid": editor["userUuid"], "role": "viewer"}],
    })
    ids.update(space=space["uuid"], private_space=private["uuid"], view_only_space=view_only["uuid"])

    ids["space_chart"] = composer({"spaceUuid": space["uuid"]}, "Emulator space payments")["uuid"]
    ids["private_chart"] = composer(
        {"spaceUuid": private["uuid"]}, "Emulator private payments")["uuid"]
    ids["view_only_chart"] = composer(
        {"spaceUuid": view_only["uuid"]}, "Emulator view only payments")["uuid"]
    view_only_dashboard = app("POST", f"/api/v1/projects/{PROJECT}/dashboards", {
        "name": "Emulator view only dashboard", "tiles": [], "tabs": [],
        "spaceUuid": view_only["uuid"]})
    ids["view_only_dashboard_chart"] = composer(
        {"dashboardUuid": view_only_dashboard["uuid"]},
        "Emulator view only dashboard payments")["uuid"]

    dashboard = app("POST", f"/api/v1/projects/{PROJECT}/dashboards",
                    {"name": DASHBOARD, "tiles": [], "tabs": [], "spaceUuid": space["uuid"]})
    ids["dashboard"] = dashboard["uuid"]
    owner = {"dashboardUuid": dashboard["uuid"]}
    ids["dashboard_chart"] = composer(owner, "Emulator dashboard payments")["uuid"]
    bar = {"type": "cartesian", "config": {
        "layout": {"xField": "payment_method", "yField": ["total_amount"]},
        "eChartsConfig": {"series": [{"type": "bar", "encode": {
            "xRef": {"field": "payment_method"}, "yRef": {"field": "total_amount"}}}]}}}
    ids["bad_series_chart"] = composer(owner, "Emulator bad series payments", bar)["uuid"]
    # The API refuses an unknown series type, so the stored version is changed in place.
    psql(
        "update composer_chart_versions set chart = jsonb_set(chart, "
        "'{chartConfig,config,eChartsConfig,series,0,type}', '\"not_a_series\"') "
        f"where composer_chart_uuid = '{ids['bad_series_chart']}'"
    )
    add_tiles(dashboard, [ids["dashboard_chart"], ids["bad_series_chart"]])
    add_tiles(view_only_dashboard, [ids["view_only_dashboard_chart"]])

    source = app("GET", f"/api/v1/saved/{CLASSIC_SOURCE}")
    classic = {k: source[k] for k in (
        "tableName", "metricQuery", "chartConfig", "tableConfig", "pivotConfig") if k in source}
    ids["classic_chart"] = app("POST", f"/api/v1/projects/{PROJECT}/saved", {
        **classic, "name": "Emulator classic payments", "description": None,
        "spaceUuid": space["uuid"],
    })["uuid"]

    column = lambda ref: {"visible": True, "reference": ref, "label": ref, "frozen": False}  # noqa: E731
    ids["sql_chart"] = app("POST", f"/api/v1/projects/{PROJECT}/sqlRunner/saved", {
        "name": "Emulator SQL payments", "description": None, "sql": SQL, "limit": 500,
        "spaceUuid": space["uuid"],
        "config": {"metadata": {"version": 1}, "type": "table", "display": {}, "columns": {
            "payment_method": column("payment_method"), "total_amount": column("total_amount")}},
    })["savedSqlUuid"]
    return ids


def max_persisted_id():
    ids = psql(
        "select tool_call_id from ai_agent_tool_call union all "
        "select tool_call_id from ai_sql_approval"
    )
    numbers = [int(m.group(1)) for m in re.finditer(r"^[a-z]+_(\d+)$", ids, re.M)]
    return max(numbers, default=0)


def advance_emulator_ids():
    """Emulator ids restart at 1 on reset; an approval is keyed by its tool call id."""
    floor = max_persisted_id()
    current = 0
    while current <= floor:
        reply = emulator("POST", "/v1/responses", {"model": "advance", "input": "advance"})
        current = int(reply["id"].rsplit("_", 1)[1])
    emulator("DELETE", "/_ai/calls")


def substitute(text, ids):
    def replace(match):
        key = match.group(1)
        if key not in ids:
            sys.exit(f"Unknown placeholder {{{{{key}}}}}")
        return ids[key]
    return re.sub(r"\{\{(\w+)\}\}", replace, text)


def scenario_files():
    return sorted(HERE.glob("*.json"))


def install(name, quiet=False):
    path = HERE / f"{name}.json"
    if not path.exists():
        sys.exit(f"No scenario {name}; run list")
    check_opt_in()
    set_flag("default")
    ids = build_fixtures()
    spec = json.loads(substitute(path.read_text(), ids))
    meta = spec.pop("scenario")
    set_flag(meta.get("composerCharts", "default"))
    emulator("PUT", "/_ai/rules", spec)
    advance_emulator_ids()
    meta["fixtures"] = ids
    if not quiet:
        print(json.dumps({"scenario": name, **meta}, indent=2))
    return meta


def pending_tool_calls(thread):
    return psql(
        "select c.tool_call_id from ai_agent_tool_call c join ai_prompt p "
        "on p.ai_prompt_uuid = c.ai_prompt_uuid "
        f"where p.ai_thread_uuid = '{thread}' and not exists (select 1 from "
        "ai_agent_tool_result r where r.tool_call_id = c.tool_call_id "
        "and r.ai_prompt_uuid = c.ai_prompt_uuid)"
    ).split()


def model_steps():
    calls = emulator("GET", "/_ai/calls")
    calls = calls if isinstance(calls, list) else calls.get("calls", [])
    return [(c.get("matched") or {}).get("id") for c in calls if c.get("stream")]


def run(name):
    meta = install(name, quiet=True)
    session = sign_in(meta["persona"])
    agent = meta["fixtures"]["agent"]
    threads = f"/api/v1/projects/{PROJECT}/aiAgents/{agent}/threads"
    thread = app("POST", threads, {"prompt": meta["prompt"]}, session)["uuid"]
    stream = threading.Thread(
        target=app,
        # Fast decisions call an external model that narrows tools by intent; off for a fixed turn.
        args=("POST", f"{threads}/{thread}/stream", {"enableFastDecisions": False}, session, 300),
    )
    stream.start()
    decided = set()
    deadline = time.monotonic() + 240
    while stream.is_alive() and time.monotonic() < deadline:
        time.sleep(1)
        for call_id in pending_tool_calls(thread):
            if call_id in decided or meta.get("decision") is None:
                continue
            try:
                app("POST", f"{threads}/{thread}/tool-calls/{call_id}/sql-approval",
                    {"decision": meta["decision"]}, session)
                decided.add(call_id)
            except HttpError:
                pass  # not an approval, or not asked yet
    stream.join(5)
    result = app("GET", f"{threads}/{thread}", auth=session)
    reply = [m for m in result["messages"] if m["role"] == "assistant"][-1]
    results = {r["toolCallId"]: r for r in reply.get("toolResults") or []}
    print(json.dumps({
        "scenario": name, "persona": meta["persona"], "thread": thread,
        "url": f"/projects/{PROJECT}/ai-agents/{agent}/threads/{thread}",
        "status": reply.get("status"), "approvals": sorted(decided),
        "toolCalls": [{
            "id": c["toolCallId"], "tool": c["toolName"], "args": c.get("toolArgs"),
            "status": (results.get(c["toolCallId"], {}).get("metadata") or {}).get("status"),
            "result": (results.get(c["toolCallId"], {}).get("result") or "")[:400],
        } for c in reply.get("toolCalls") or []],
        "answer": reply.get("message"),
        "modelSteps": model_steps(),
    }, indent=2))


def reset(clean):
    emulator("POST", "/_ai/reset")
    advance_emulator_ids()
    set_flag("default")
    if clean:
        remove_fixtures()
        for agent in app("GET", f"/api/v1/projects/{PROJECT}/aiAgents"):
            if agent["name"] == AGENT_NAME:
                app("DELETE", f"/api/v1/projects/{PROJECT}/aiAgents/{agent['uuid']}")
    print("Seed replies restored" + (", fixtures removed" if clean else ""))


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "list"
    if command == "list":
        for path in scenario_files():
            print(f"{path.stem:40} {json.loads(path.read_text())['scenario']['title']}")
    elif command == "install" and len(sys.argv) == 3:
        install(sys.argv[2])
    elif command == "run" and len(sys.argv) == 3:
        run(sys.argv[2])
    elif command == "reset":
        reset("--clean" in sys.argv[2:])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
