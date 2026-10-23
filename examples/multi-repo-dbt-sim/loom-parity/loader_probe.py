import functools
import gzip
import http.server
import json
import os
import shutil
import socketserver
import threading

import loomfuzz as lf

work = lf.WORK / "loaders"
shutil.rmtree(work, ignore_errors=True)
rows = {}
(work / "profiles").mkdir(parents=True)
(work / "profiles" / "profiles.yml").write_text(lf.profiles_yml())
prov = lf.write_project(
    work / "src",
    {
        "name": "provider_a",
        "models": [{"name": "orders", "access": "public", "refs": []}],
    },
)
cons = lf.write_project(
    work / "src",
    {
        "name": "consumer_x",
        "models": [
            {"name": "r1", "access": "public", "refs": [("provider_a", "orders", None)]}
        ],
    },
)
seed = lf.run_parse(lf.NOLOOM_DBT, prov, work / "seed" / "provider_a")
assert seed["returncode"] == 0, seed["output"]
store = work / "store"
(store / "provider_a").mkdir(parents=True)
plain = store / "provider_a" / "manifest.json"
shutil.copy(work / "seed" / "provider_a" / "manifest.json", plain)
with gzip.open(store / "provider_a" / "manifest.json.gz", "wb") as g:
    g.write(plain.read_bytes())
(store / "provider_a" / "corrupt.json").write_text("{not json")
(store / "provider_a" / "empty.json").write_text("")
# local http server
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(store))
httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()


def loom(label, manifests, select=None):
    cfg = work / f"{label}.yml"
    cfg.write_text(json.dumps({"manifests": manifests}))
    env = {"DBT_LOOM_CONFIG": str(cfg)}
    r = lf.run_parse(lf.LOOM_DBT, cons, work / "t" / label, env)
    tail = [
        l
        for l in r["tail"]
        if "dbt-loom" not in l
        and "Running with" not in l
        and "Registered adapter" not in l
    ][-3:]
    rows[label] = {
        "status": lf.classify(r),
        "returncode": r["returncode"],
        "tail": tail,
    }
    print(
        f"{label:34} status={lf.classify(r):14} rc={r['returncode']} | {' / '.join(t[:160] for t in tail)}"
    )


F = lambda p, **k: {"name": "provider_a", "type": "file", "config": {"path": p}, **k}
loom("A1-file-plain", [F(str(plain))])
loom("A2-file-gzip", [F(str(store / "provider_a" / "manifest.json.gz"))])
loom("A3-file-corrupt", [F(str(store / "provider_a" / "corrupt.json"))])
loom("A4-file-empty", [F(str(store / "provider_a" / "empty.json"))])
loom("A5-file-missing-optional", [F(str(store / "nope.json"), optional=True)])
loom("A6-file-missing-required", [F(str(store / "nope.json"))])
loom("A7-http-200", [F(f"http://127.0.0.1:{port}/provider_a/manifest.json")])
loom("A8-http-200-gzip", [F(f"http://127.0.0.1:{port}/provider_a/manifest.json.gz")])
loom(
    "A9-http-404-optional",
    [F(f"http://127.0.0.1:{port}/provider_a/nope.json", optional=True)],
)
loom("A10-http-404-required", [F(f"http://127.0.0.1:{port}/provider_a/nope.json")])
loom(
    "A11-http-refused-optional", [F("http://127.0.0.1:9/manifest.json", optional=True)]
)
loom(
    "A12-s3-nocreds-optional",
    [
        {
            "name": "provider_a",
            "type": "s3",
            "config": {"bucket_name": "bucket-x", "object_name": "manifest.json"},
            "optional": True,
        }
    ],
)
loom(
    "A13-gcs-nocreds-optional",
    [
        {
            "name": "provider_a",
            "type": "gcs",
            "config": {
                "project_id": "p",
                "bucket_name": "bucket-x",
                "object_name": "manifest.json",
            },
            "optional": True,
        }
    ],
)
loom(
    "A14-azure-nocreds-optional",
    [
        {
            "name": "provider_a",
            "type": "azure",
            "config": {
                "account_name": "acc",
                "container_name": "c",
                "object_name": "manifest.json",
            },
            "optional": True,
        }
    ],
)
loom(
    "A15-dbt_cloud-nocreds-optional",
    [
        {
            "name": "provider_a",
            "type": "dbt_cloud",
            "config": {"account_id": 1, "job_id": 1},
            "optional": True,
        }
    ],
)
loom(
    "A16-unknown-type", [{"name": "provider_a", "type": "ftp", "config": {"path": "x"}}]
)
loom(
    "B1-include-and-exclude",
    [F(str(plain), included_packages=["provider_a"], excluded_packages=["x"])],
)
loom("B2-include-unknown", [F(str(plain), included_packages=["nope"])])
loom("B3-exclude-self", [F(str(plain), excluded_packages=["provider_a"])])
loom("B4-include-self", [F(str(plain), included_packages=["provider_a"])])
loom("B5-empty-include-list", [F(str(plain), included_packages=[])])
loom(
    "C1-two-refs-same-manifest",
    [F(str(plain)), {**F(str(plain)), "name": "provider_a_again"}],
)
loom("C2-env-var-path", [F("${LOOM_PATH_X}")]) if os.environ.get(
    "LOOM_PATH_X"
) else None
loom("C3-name-mismatch", [{**F(str(plain)), "name": "wrong_name"}])
httpd.shutdown()
lf.REPORTS.mkdir(parents=True, exist_ok=True)
(lf.REPORTS / "loaders.json").write_text(json.dumps(rows, indent=1) + "\n")
