import json
import os
import shutil

import loomfuzz as lf

work = lf.WORK / "select"
shutil.rmtree(work, ignore_errors=True)
(work / "profiles").mkdir(parents=True)
(work / "profiles" / "profiles.yml").write_text(lf.profiles_yml())
prov = lf.write_project(
    work / "src",
    {
        "name": "provider_a",
        "models": [
            {"name": "orders", "access": "public", "refs": []},
            {"name": "customers", "access": "public", "refs": []},
            {"name": "hidden", "access": "protected", "refs": []},
        ],
    },
)


def run(label, select=None, command="ls"):
    os.environ["FUZZ_DBT_COMMAND"] = command
    if select:
        os.environ["FUZZ_SELECT"] = select
    else:
        os.environ.pop("FUZZ_SELECT", None)
    r = lf.run_parse(lf.NOLOOM_DBT, prov, work / "t" / label)
    m = r["manifest"]
    real = sorted(
        k
        for k, n in (m or {}).get("nodes", {}).items()
        if n.get("resource_type") == "model"
    )
    listed = [l for l in r["output"].splitlines() if l.startswith('{"unique_id"')]
    warn = [
        l.strip()[:120]
        for l in r["output"].splitlines()
        if "NoNodesForSelectionCriteria" in l
        or "does not match any" in l
        or "Nothing to do" in l
    ]
    pub = (
        [
            n["name"]
            for n in lf.climb._public_payloads((m or {}).get("nodes", {}).values())
        ]
        if m
        else None
    )
    print(
        f"{label:28} rc={r['returncode']} manifest_models={real} listed={len(listed)} public_payload={pub} warn={warn}"
    )


run("S11a-select-orders", "orders")
run("S11b-select-missing-tag", "tag:nope")
run("S11c-no-select")
run("S11d-parse-no-select", command="parse")
# unreadable last-good through the harness projection
bad = work / "store" / "provider_a"
bad.mkdir(parents=True)
(bad / "manifest.json").write_text("{corrupt")
try:
    lf.climb.injection_for(work / "store", ["provider_a"])
    print("corrupt-store: no error (unexpected)")
except (json.JSONDecodeError, KeyError) as e:
    print("corrupt-store harness projection:", type(e).__name__, str(e)[:100])
(bad / "manifest.json").write_text(json.dumps({"metadata": {}, "nodes": {}}))
print(
    "empty-nodes-store payload:", lf.climb.injection_for(work / "store", ["provider_a"])
)
(bad / "manifest.json").write_text(json.dumps({"metadata": {}}))
try:
    print(
        "no-nodes-key-store payload:",
        lf.climb.injection_for(work / "store", ["provider_a"]),
    )
except (json.JSONDecodeError, KeyError) as e:
    print("no-nodes-key-store harness projection:", type(e).__name__, str(e)[:100])
