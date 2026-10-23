"""S1-S15 seed cases, dbt-level layer (plugin + projection vs real loom)."""

import json
import os
import sys

from loomfuzz import REPORTS, WORK, run_case, summarize


def P(name, models=None, **kw):
    return {"name": name, "models": models or [], **kw}


def M(name, access="public", refs=None, **kw):
    return {"name": name, "access": access, "refs": refs or [], **kw}


def C(name, upstreams, loom=None, **kw):
    return {
        "name": name,
        "upstreams": upstreams,
        "loom": loom if loom is not None else [{"name": u} for u in upstreams],
        **kw,
    }


CASES = []


def case(id, projects, seed_order, consumers, seed_upstreams=None, note=""):
    CASES.append(
        {
            "id": id,
            "projects": projects,
            "seed_order": seed_order,
            "consumers": consumers,
            "seed_upstreams": seed_upstreams or {},
            "note": note,
        }
    )


# S1 one-arg ref, two providers both public orders / only one has it
case(
    "S1a-both-public",
    [
        P("provider_a", [M("orders")]),
        P("provider_b", [M("orders")]),
        P("consumer_x", [M("report", refs=[(None, "orders", None)])]),
    ],
    ["provider_a", "provider_b"],
    [C("consumer_x", ["provider_a", "provider_b"])],
)
case(
    "S1b-unique",
    [
        P("provider_a", [M("orders")]),
        P("provider_b", [M("other")]),
        P("consumer_x", [M("report", refs=[(None, "orders", None)])]),
    ],
    ["provider_a", "provider_b"],
    [C("consumer_x", ["provider_a", "provider_b"])],
)
# S2 A public orders, B protected orders
case(
    "S2a-onearg-public-vs-protected",
    [
        P("provider_a", [M("orders")]),
        P("provider_b", [M("orders", "protected")]),
        P("consumer_x", [M("report", refs=[(None, "orders", None)])]),
    ],
    ["provider_a", "provider_b"],
    [C("consumer_x", ["provider_a", "provider_b"])],
)
case(
    "S2b-explicit-protected",
    [
        P("provider_a", [M("orders")]),
        P("provider_b", [M("orders", "protected")]),
        P("consumer_x", [M("report2", refs=[("provider_b", "orders", None)])]),
    ],
    ["provider_a", "provider_b"],
    [C("consumer_x", ["provider_a", "provider_b"])],
)
# S3 only protected / private / unset upstreams
case(
    "S3-only-nonpublic",
    [
        P(
            "provider_a",
            [
                M("orders", "protected"),
                M("priv", "private", group="g1"),
                {"name": "unset", "refs": []},
            ],
            groups=["g1"],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "orders", None)]),
                M("r2", refs=[("provider_a", "priv", None)]),
                M("r3", refs=[("provider_a", "unset", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S4 public seed + public snapshot
case(
    "S4-public-seed-snapshot",
    [
        P(
            "provider_a",
            [M("orders")],
            seeds=[{"name": "ref_seed", "access": "public"}],
            snapshots=[
                {
                    "name": "snap_x",
                    "access": "public",
                    "refs": [("provider_a", "orders", None)],
                }
            ],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "ref_seed", None)]),
                M("r2", refs=[("provider_a", "snap_x", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S5 protected seed under public model
case(
    "S5-protected-seed",
    [
        P(
            "provider_a",
            [M("orders", refs=[(None, "base_seed", None)])],
            seeds=[
                {"name": "base_seed", "access": "protected"},
                {"name": "noaccess_seed"},
            ],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "orders", None)]),
                M("r2", refs=[("provider_a", "base_seed", None)]),
                M("r3", refs=[("provider_a", "noaccess_seed", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S6 unversioned ref to versioned model binds latest_version
case(
    "S6-latest-version",
    [
        P(
            "provider_a",
            [M("measure", version=1), M("measure", version=2, latest_version=2)],
        ),
        P("consumer_x", [M("r1", refs=[("provider_a", "measure", None)])]),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
case(
    "S6b-latest-pinned-older",
    [
        P(
            "provider_a",
            [M("measure", version=1, latest_version=1), M("measure", version=2)],
        ),
        P("consumer_x", [M("r1", refs=[("provider_a", "measure", None)])]),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S7 explicit version
case(
    "S7-explicit-v2",
    [
        P(
            "provider_a",
            [M("measure", version=1), M("measure", version=2, latest_version=2)],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "measure", 2)]),
                M("r2", refs=[("provider_a", "measure", 1)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
case(
    "S7b-missing-v3",
    [
        P(
            "provider_a",
            [M("measure", version=1), M("measure", version=2, latest_version=2)],
        ),
        P("consumer_x", [M("r1", refs=[("provider_a", "measure", 3)])]),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S8 ordered cold seed a -> b -> c
case(
    "S8-ordered-chain",
    [
        P("provider_a", [M("base")]),
        P("provider_b", [M("mid", refs=[("provider_a", "base", None)])]),
        P("consumer_x", [M("top", refs=[("provider_b", "mid", None)])]),
    ],
    ["provider_a", "provider_b"],
    [
        C("consumer_x", ["provider_b"]),
        C("consumer_x_all", ["provider_a", "provider_b"]),
    ],
    seed_upstreams={"provider_b": ["provider_a"]},
)
# S9 cold ring, no seeds at all: each provider parsed with empty store
case(
    "S9-cold-ring",
    [
        P(
            "provider_a",
            [M("a_base"), M("a_top", refs=[("provider_b", "b_base", None)])],
        ),
        P(
            "provider_b",
            [M("b_base"), M("b_top", refs=[("provider_a", "a_base", None)])],
        ),
    ],
    ["provider_a", "provider_b"],
    [C("provider_a", ["provider_b"]), C("provider_b", ["provider_a"])],
    seed_upstreams={"provider_a": ["provider_b"], "provider_b": ["provider_a"]},
)
# S9b true model cycle through seeded manifests
CASES.append(
    {
        "id": "S9b-model-cycle-seeded",
        "projects": [
            P("provider_a", [M("x", refs=[("provider_b", "y", None)])]),
            P("provider_b", [M("y", refs=[("provider_a", "x", None)])]),
        ],
        "seed_projects": [
            P("provider_a", [M("x")]),
            P("provider_b", [M("y", refs=[("provider_a", "x", None)])]),
        ],
        "seed_order": ["provider_a", "provider_b"],
        "seed_upstreams": {"provider_b": ["provider_a"]},
        "consumers": [C("provider_a", ["provider_b"]), C("provider_b", ["provider_a"])],
    }
)
CASES.append(
    {
        "id": "S9c-cycle-via-protected",
        "projects": [
            P(
                "provider_a",
                [
                    M("pub", refs=[(None, "prot", None)]),
                    M("prot", "protected", refs=[("provider_b", "m", None)]),
                ],
            ),
            P("provider_b", [M("m", refs=[("provider_a", "pub", None)])]),
        ],
        "seed_projects": [
            P(
                "provider_a",
                [M("pub", refs=[(None, "prot", None)]), M("prot", "protected")],
            ),
            P("provider_b", [M("m", refs=[("provider_a", "pub", None)])]),
        ],
        "seed_order": ["provider_a", "provider_b"],
        "seed_upstreams": {"provider_b": ["provider_a"]},
        "consumers": [C("provider_a", ["provider_b"]), C("provider_b", ["provider_a"])],
    }
)
# G resource types: analysis in provider; consumer refs it
case(
    "G1-analysis-node",
    [
        P(
            "provider_a",
            [M("orders")],
            analyses=[{"name": "an_x", "refs": [(None, "orders", None)]}],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "an_x", None)]),
                M("r2", refs=[("provider_a", "orders", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# E version typing: string version and float-ish
case(
    "E1-string-version",
    [
        P(
            "provider_a",
            [M("measure", version="a"), M("measure", version="b", latest_version="b")],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "measure", None)]),
                M("r2", refs=[("provider_a", "measure", "'a'")]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
case(
    "E2-float-version",
    [
        P(
            "provider_a",
            [M("measure", version=1.5), M("measure", version=2, latest_version=2)],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "measure", 1.5)]),
                M("r2", refs=[("provider_a", "measure", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# D ephemeral public model (relation_name null) and aliased model
case(
    "D1-ephemeral-alias",
    [
        P(
            "provider_a",
            [
                {
                    "name": "aliased",
                    "access": "public",
                    "refs": [],
                    "alias": "orders_alias",
                }
            ],
        ),
        P("consumer_x", [M("r2", refs=[("provider_a", "aliased", None)])]),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# D multi provider same public id (two providers claim package name provider_a via packages)

# S10 withheld store
case(
    "S10-withheld",
    [
        P("provider_a", [M("orders")]),
        P("consumer_x", [M("r1", refs=[("provider_a", "orders", None)])]),
    ],
    [],
    [C("consumer_x", ["provider_a"], loom=[{"name": "provider_a", "optional": True}])],
)
# S12 depends_on lists protected sibling
case(
    "S12-protected-sibling-edge",
    [
        P(
            "provider_a",
            [
                M("hidden", "protected"),
                M("pub_sib"),
                M("orders", refs=[(None, "hidden", None), (None, "pub_sib", None)]),
            ],
        ),
        P("consumer_x", [M("r1", refs=[("provider_a", "orders", None)])]),
    ],
    ["provider_a"],
    [C("consumer_x", ["provider_a"])],
)
# S13 included/excluded packages: provider installs a local package whose public models land in the provider manifest
case(
    "S13-packages",
    [
        P("shared_pkg", [M("shared_model"), M("shared_hidden", "protected")]),
        P(
            "provider_a",
            [M("orders", refs=[("shared_pkg", "shared_model", None)])],
            packages=["shared_pkg"],
        ),
        P(
            "consumer_x",
            [
                M("r1", refs=[("provider_a", "orders", None)]),
                M("r2", refs=[("shared_pkg", "shared_model", None)]),
            ],
        ),
    ],
    ["provider_a"],
    [
        C("consumer_x", ["provider_a"], loom=[{"name": "provider_a"}]),
        C(
            "consumer_x_incl",
            ["provider_a"],
            loom=[{"name": "provider_a", "included_packages": ["provider_a"]}],
        ),
        C(
            "consumer_x_excl",
            ["provider_a"],
            loom=[{"name": "provider_a", "excluded_packages": ["shared_pkg"]}],
        ),
        C(
            "consumer_x_unknownpkg",
            ["provider_a"],
            loom=[{"name": "provider_a", "included_packages": ["nope"]}],
        ),
    ],
)
# S14 optional missing manifest
case(
    "S14-optional",
    [
        P("provider_a", [M("orders")]),
        P("consumer_x", [M("r1", refs=[("provider_a", "orders", None)])]),
        P("consumer_y", [M("r1")]),
    ],
    ["provider_a"],
    [
        C(
            "consumer_x",
            ["provider_a", "ghost"],
            loom=[{"name": "provider_a"}, {"name": "ghost", "optional": True}],
        ),
        C(
            "consumer_x_notoptional",
            ["provider_a", "ghost"],
            loom=[{"name": "provider_a"}, {"name": "ghost"}],
        ),
        C("consumer_y", [], loom=[{"name": "ghost", "optional": True}]),
    ],
)
# S15 zero sources
case(
    "S15-zero-sources", [P("consumer_x", [M("r1")])], [], [C("consumer_x", [], loom=[])]
)

if __name__ == "__main__":
    selected = sys.argv[1:]
    out = {}
    for c in CASES:
        if selected and c["id"] not in selected:
            continue
        # consumer names like consumer_x_all map to project consumer_x
        for cons in c["consumers"]:
            cons.setdefault(
                "project",
                cons["name"]
                .replace("_all", "")
                .replace("_incl", "")
                .replace("_excl", "")
                .replace("_unknownpkg", "")
                .replace("_notoptional", ""),
            )
        r = run_case(c, WORK / "seed-cases" / c["id"])
        out[c["id"]] = r
        print(summarize(r), flush=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    name = (
        "seed-cases-ls.json"
        if os.environ.get("FUZZ_DBT_COMMAND") == "ls"
        else "seed-cases.json"
    )
    (REPORTS / name).write_text(json.dumps(out, indent=1) + "\n")
