"""Combinatorial fuzz on axes B-H with real dbt: loom vs Fix 7b plugin under dbt ls."""

import json
import os
import random
import subprocess
import sys

from loomfuzz import REPORTS, WORK, run_case

NAMES = ["orders", "customers", "ledger", "measure"]
ACCESS = ["public", "public", "public", "protected", "private", None]


def gen(seed):
    rnd = random.Random(seed)
    nprov = rnd.choice([1, 2, 2, 3])
    projects = []
    for i in range(nprov):
        name = f"provider_{chr(97 + i)}"
        models, seeds, snaps = [], [], []
        used = set()
        for _ in range(rnd.choice([1, 2, 3])):
            base = rnd.choice(NAMES)
            if base in used:
                continue
            used.add(base)
            kind = rnd.choices(
                ["model", "versioned", "seed", "snapshot"], [6, 2, 1, 1]
            )[0]
            acc = rnd.choice(ACCESS)
            if kind == "versioned":
                latest = rnd.choice([1, 2])
                models.append(
                    {
                        "name": base,
                        "access": acc,
                        "version": 1,
                        "latest_version": latest,
                        "refs": [],
                    }
                )
                models.append(
                    {
                        "name": base,
                        "access": rnd.choice(ACCESS),
                        "version": 2,
                        "latest_version": latest,
                        "refs": [],
                    }
                )
            elif kind == "seed":
                seeds.append({"name": base, **({"access": acc} if acc else {})})
            elif kind == "snapshot":
                snaps.append({"name": base, **({"access": acc} if acc else {})})
            else:
                m = {"name": base, "access": acc, "refs": []}
                # local dep on an earlier sibling sometimes
                if models and rnd.random() < 0.4:
                    m["refs"] = [(None, models[0]["name"], None)]
                models.append(m)
        # drop None access keys
        for m in models:
            if m["access"] is None:
                del m["access"]
        projects.append(
            {"name": name, "models": models, "seeds": seeds, "snapshots": snaps}
        )
    # consumer refs: 1-3 refs at provider resources
    cons_models = []
    for j in range(rnd.choice([1, 2, 3])):
        p = rnd.choice(projects)
        pool = (
            [("model", m) for m in p["models"]]
            + [("seed", s) for s in p["seeds"]]
            + [("snapshot", s) for s in p["snapshots"]]
        )
        if not pool:
            continue
        kind, target = rnd.choice(pool)
        explicit = rnd.random() < 0.7
        version = None
        if target.get("version") is not None and rnd.random() < 0.5:
            version = rnd.choice([1, 2, 3])
        cons_models.append(
            {
                "name": f"r{j}",
                "access": "public",
                "refs": [(p["name"] if explicit else None, target["name"], version)],
            }
        )
    projects.append({"name": "consumer_x", "models": cons_models})
    provs = [p["name"] for p in projects if p["name"] != "consumer_x"]
    return {
        "id": f"F{seed}",
        "projects": projects,
        "seed_order": provs,
        "consumers": [
            {
                "name": "consumer_x",
                "project": "consumer_x",
                "upstreams": provs,
                "loom": [{"name": u} for u in provs],
            }
        ],
    }


KNOWN = {
    ("pass", "pass"): "parity",
    ("access-denied", "unresolved"): "withheld-both (loom denies, 7b never injects)",
    ("unresolved", "unresolved"): "parity-unresolved",
    ("error", "error"): "parity-dbt-error",
    (
        "error",
        "pass",
    ): "loom ambiguity on protected twin; 7b resolves public (S2a class)",
    ("error", "unresolved"): "loom ambiguity; 7b unresolved",
    (
        "crash",
        "unresolved",
    ): "upstream never seeded (provider parse failed): loom crash, 7b unresolved",
    ("access-denied", "pass"): "GAP? loom denies but 7b resolves",
    ("pass", "unresolved"): "GAP? loom resolves but 7b unresolved",
    ("pass", "error"): "GAP? loom resolves but 7b errors",
}
if __name__ == "__main__":
    os.environ["FUZZ_DBT_COMMAND"] = "ls"
    start, n = int(sys.argv[1]), int(sys.argv[2])
    out = {}
    for seed in range(start, start + n):
        c = gen(seed)
        try:
            r = run_case(c, WORK / "combo" / c["id"])
        except (RuntimeError, subprocess.CalledProcessError, OSError, KeyError) as e:
            print(f"{c['id']} HARNESS-CRASH {type(e).__name__}: {e}", flush=True)
            out[c["id"]] = {"crash": str(e), "case": c}
            continue
        row = r["consumers"]["consumer_x"]
        key = (row["loom"]["status"], row["fix7b"]["status"])
        verdict = KNOWN.get(key, f"UNCLASSIFIED {key}")
        beq = row["loom"]["bindings"] == row["fix7b"]["bindings"]
        if key == ("pass", "pass") and not beq:
            verdict = "GAP? both pass, bindings differ"
        print(
            f"{c['id']:6} loom={key[0]:14} fix7b={key[1]:12} bindings_equal={beq!s:5} {verdict}",
            flush=True,
        )
        out[c["id"]] = {
            "key": key,
            "verdict": verdict,
            "bindings_equal": beq,
            "case": c,
            "loom": row["loom"],
            "fix7b": row["fix7b"],
            "providers": r["providers"],
        }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / f"combo-{start}-{n}.json").write_text(
        json.dumps(out, indent=1, default=str) + "\n"
    )
