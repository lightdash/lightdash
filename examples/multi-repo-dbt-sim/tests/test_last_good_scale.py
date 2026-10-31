import json
import sys
import tempfile
import unittest
from pathlib import Path

SIM = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SIM))
sys.path.insert(0, str(SIM / "last-good-climb"))

import climb

import last_good_scale as scale
import scale_additions


def _node(name, access):
    return {
        "resource_type": "model",
        "path": f"{name}.sql",
        "original_file_path": f"models/{name}.sql",
        "access": access,
        "name": name,
        "package_name": "pkg",
        "unique_id": f"model.pkg.{name}",
        "alias": name,
        "schema": "analytics",
        "database": None,
        "relation_name": None,
        "version": None,
        "latest_version": None,
        "depends_on": {"nodes": []},
    }


class LastGoodScaleTests(unittest.TestCase):
    def test_present_contract_stays_public_only(self):
        manifest = {
            "metadata": {"project_name": "pkg"},
            "nodes": {
                "model.pkg.pub": _node("pub", "public"),
                "model.pkg.priv": _node("priv", "protected"),
            },
        }
        manifest["nodes"]["model.pkg.hidden"] = _node("hidden", "private")
        manifest["nodes"]["model.pkg.unset"] = _node("unset", None)
        manifest["nodes"]["model.pkg.pub"]["depends_on"] = {
            "nodes": ["model.pkg.priv", "model.pkg.hidden", "model.pkg.unset"]
        }
        selected = climb.external_nodes(manifest)
        self.assertEqual([node["name"] for node in selected], ["pub"])
        self.assertEqual(selected[0]["depends_on_nodes"], [])
        self.assertNotIn("resource_type", selected[0])

    def test_public_seeds_and_snapshots_join_the_inject_surface(self):
        def resource(name, resource_type, access, depends=(), config_access=None):
            node = _node(name, access)
            node["resource_type"] = resource_type
            node["unique_id"] = f"{resource_type}.pkg.{name}"
            node["package_name"] = "pkg"
            node["path"] = f"{name}.sql"
            node["depends_on"] = {"nodes": list(depends)}
            if config_access is not None:
                node["config"] = {"access": config_access}
            return node["unique_id"], node

        lookup_id, lookup = resource("lookup", "seed", None, config_access="public")
        secret_id, secret = resource("secret", "seed", "private")
        history_id, history = resource(
            "history",
            "snapshot",
            None,
            depends=(lookup_id, secret_id, "model.other.public_base"),
            config_access="public",
        )
        _, internal = resource("internal", "snapshot", "protected")
        _, unset_seed = resource("unset_seed", "seed", None)
        _, overridden = resource(
            "overridden", "seed", "protected", config_access="public"
        )
        report_id, report = resource(
            "report",
            "model",
            "public",
            depends=(
                lookup_id,
                history_id,
                secret_id,
                "model.other.public_base",
                "model.pkg.hidden",
            ),
        )
        _, hidden = resource("hidden", "model", "protected")
        manifest = {
            "metadata": {"project_name": "pkg"},
            "nodes": {
                lookup_id: lookup,
                secret_id: secret,
                history_id: history,
                internal["unique_id"]: internal,
                unset_seed["unique_id"]: unset_seed,
                overridden["unique_id"]: overridden,
                report_id: report,
                hidden["unique_id"]: hidden,
            },
        }
        selected = {node["name"]: node for node in climb.external_nodes(manifest)}
        self.assertEqual(set(selected), {"lookup", "history", "report"})
        self.assertEqual(selected["lookup"]["resource_type"], "seed")
        self.assertEqual(selected["history"]["resource_type"], "snapshot")
        self.assertEqual(selected["lookup"]["access"], "public")
        self.assertEqual(selected["history"]["depends_on_nodes"], [lookup_id])
        self.assertEqual(
            selected["report"]["depends_on_nodes"], [lookup_id, history_id]
        )
        self.assertNotIn("resource_type", selected["report"])

    def test_depends_on_keeps_only_ids_injected_from_any_upstream(self):
        def model(package, name, depends):
            node = _node(name, "public")
            node["package_name"] = package
            node["unique_id"] = f"model.{package}.{name}"
            node["depends_on"] = {"nodes": list(depends)}
            return node["unique_id"], node

        base_id, base = model("proj_b", "public_base", ())
        other_id, other = model("proj_c", "public_base", ())
        report_id, report = model(
            "proj_a",
            "report",
            (base_id, other_id, "model.proj_a.hidden"),
        )
        hidden_id, hidden = model("proj_a", "hidden", ())
        hidden["access"] = "protected"
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)

            def publish(project, nodes):
                path = store / project / "manifest.json"
                path.parent.mkdir()
                path.write_text(
                    json.dumps({"metadata": {"project_name": project}, "nodes": nodes}),
                    encoding="utf-8",
                )

            publish(
                "proj_a",
                {report_id: report, hidden_id: hidden},
            )
            publish("proj_b", {base_id: base})
            publish("proj_c", {other_id: other})
            injected = {
                node["name"]: node
                for node in climb.injection_for(store, ["proj_a", "proj_b"])
            }
            self.assertEqual(set(injected), {"report", "public_base"})
            self.assertEqual(injected["report"]["depends_on_nodes"], [base_id])
            self.assertEqual(injected["public_base"]["package_name"], "proj_b")

    def test_tree_bytes_ignore_parse_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "models").mkdir()
            (root / "models" / "one.sql").write_text("select 1\n", encoding="utf-8")
            (root / "target").mkdir()
            (root / "target" / "manifest.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(scale.tree_bytes(root), len(b"select 1\n"))

    def test_consumer_is_the_widest_upstream_list(self):
        sources = [
            {"name": "proj_b", "upstreams": ["proj_a"]},
            {"name": "proj_growth", "upstreams": ["analyst_hub", "proj_core"]},
            {"name": "leaf", "upstreams": []},
        ]
        self.assertEqual(scale.choose_consumer(sources), "proj_growth")

    def test_ref_filter_is_smaller_than_all_real_models(self):
        nodes = [
            {"package_name": "proj_beta", "name": "measure"},
            {"package_name": "proj_beta", "name": "beta_base"},
            {"package_name": "other", "name": "unused"},
        ]
        refs = [{"package": "proj_beta", "model": "measure", "version": None}]
        filtered = scale.ref_filtered(nodes, refs)
        self.assertEqual([node["name"] for node in filtered], ["measure"])

    def test_case_report_uses_the_heavier_rss_and_required_fields(self):
        report = scale.case_report(
            {
                "fixture": "large-org",
                "source_count": 19,
                "models": 49,
                "manifest_model_nodes": 49,
                "artefact_bytes_per_source": [
                    {"source": "proj_a", "bytes": 10, "models": 2}
                ],
                "artefact_bytes_total": 10,
                "consumer": "proj_growth",
                "injected_node_count": 40,
                "injected_payload_bytes": 4000,
                "public_injected_node_count": 40,
                "non_public_models_omitted": 0,
                "ref_filtered_node_count": 3,
                "ref_filtered_payload_bytes": 300,
                "climb": {
                    "dbt_peak_rss_bytes": 100,
                    "parse_seconds": 1.5,
                    "returncode": 0,
                    "cycle_error": False,
                    "injector_peak_rss_bytes": 80,
                    "injector_seconds": 0.2,
                },
                "baseline": {
                    "kind": "serial",
                    "checkout_bytes_total": 20,
                    "checkout_bytes_per_source": [],
                    "parse_seconds": 9.0,
                    "peak_rss_bytes": 90,
                    "sources": [],
                },
                "withheld": {
                    "returncode": 2,
                    "unresolved": True,
                    "parse_seconds": 1.2,
                    "peak_rss_bytes": 70,
                },
            }
        )
        for key in scale.TOP_LEVEL:
            self.assertIn(key, report)
        self.assertEqual(report["peak_rss_bytes"], 100)
        self.assertEqual(report["parse_seconds"], 1.5)
        self.assertEqual(report["injection_policy"], "access-public")
        document = scale.report_document(
            [report],
            {"packages": {"dbt-core": "1.12.0"}},
            "run-last-good-scale",
            None,
        )
        self.assertEqual(document["source_count"], 19)
        self.assertEqual(document["fixtures"][0]["models"], 49)
        self.assertIsNone(document["previous_inject_all"])
        json.dumps(document)

    def test_previous_inject_all_headline_is_retained(self):
        report = scale.case_report(
            {
                "fixture": "large-org",
                "source_count": 19,
                "models": 49,
                "manifest_model_nodes": 49,
                "artefact_bytes_per_source": [],
                "artefact_bytes_total": 10,
                "consumer": "proj_core",
                "injected_node_count": 44,
                "injected_payload_bytes": 12,
                "public_injected_node_count": 44,
                "non_public_models_omitted": 0,
                "ref_filtered_node_count": 2,
                "ref_filtered_payload_bytes": 3,
                "climb": {
                    "dbt_peak_rss_bytes": 100,
                    "parse_seconds": 1.5,
                    "injector_peak_rss_bytes": 80,
                    "injector_seconds": 0.2,
                },
                "baseline": {
                    "checkout_bytes_total": 20,
                    "parse_seconds": 9.0,
                    "peak_rss_bytes": 90,
                },
                "withheld": {"parse_seconds": 1.2, "peak_rss_bytes": 70},
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-good-scale.json"
            path.write_text(
                json.dumps(
                    {"injection_policy": "all-real-models", "fixtures": [report]}
                ),
                encoding="utf-8",
            )
            prior = scale.previous_inject_all(path)
            self.assertEqual(prior["fixtures"][0]["injected_node_count"], 44)
            self.assertEqual(prior["fixtures"][0]["peak_rss_bytes"], 100)
            path.write_text(
                json.dumps(
                    {
                        "injection_policy": "access-public",
                        "previous_inject_all": prior,
                        "fixtures": [],
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                scale.previous_inject_all(path)["fixtures"][0]["peak_rss_bytes"],
                100,
            )

    def test_scale_additions_write_public_assets_and_a_package_control(self):
        registry = {
            "sources": [
                {
                    "name": "proj_core",
                    "upstreams": ["proj_bank", "proj_bank_reporting"],
                },
                {"name": "proj_bank", "upstreams": []},
                {"name": "proj_bank_reporting", "upstreams": []},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in registry["sources"]:
                (root / "repos" / source["name"] / "models").mkdir(parents=True)
            added = scale_additions.apply(root, registry, "proj_core")
            self.assertEqual(added["installers"], ["proj_bank", "proj_bank_reporting"])
            self.assertEqual(added["reference_upstream"], "proj_bank")
            self.assertEqual(
                added["consumer_refs"],
                [
                    "seed.proj_bank.proj_bank_public_seed",
                    "snapshot.proj_bank.proj_bank_history",
                ],
            )
            seed_yaml = json.loads(
                (root / "repos/proj_core/seeds/public_seed.yml").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(seed_yaml["seeds"][0]["config"]["access"], "public")
            self.assertNotIn("access", seed_yaml["seeds"][0])
            snapshot_yaml = json.loads(
                (root / "repos/proj_core/snapshots/proj_core_history.yml").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(
                snapshot_yaml["snapshots"][0]["relation"],
                "ref('proj_core_public_seed')",
            )
            self.assertEqual(
                snapshot_yaml["snapshots"][0]["config"]["access"], "public"
            )
            self.assertTrue((root / "repos/proj_bank/packages.yml").is_file())
            self.assertFalse((root / "repos/proj_core/packages.yml").exists())
            package = root / "packages" / scale_additions.PACKAGE_NAME
            self.assertTrue((package / "seeds" / "pkg_shared_seed.csv").is_file())
            self.assertTrue(
                (package / "snapshots" / "pkg_shared_history.yml").is_file()
            )
            consumer_sql = (
                root / "repos/proj_core/models/uses_public_assets.sql"
            ).read_text(encoding="utf-8")
            self.assertIn("var('sim_bootstrap', false)", consumer_sql)
            self.assertIn("ref('proj_bank', 'proj_bank_public_seed')", consumer_sql)
            self.assertIn("ref('proj_bank', 'proj_bank_history')", consumer_sql)
            self.assertTrue(
                all(not path.startswith("..") for path in added["files_written"])
            )

    def test_injection_summary_omits_installed_package_resources(self):
        def resource(package, name, resource_type, access):
            node = _node(name, None if resource_type != "model" else access)
            node["resource_type"] = resource_type
            node["package_name"] = package
            node["unique_id"] = f"{resource_type}.{package}.{name}"
            node["path"] = f"{name}.csv" if resource_type == "seed" else f"{name}.sql"
            if resource_type != "model":
                node["config"] = {"access": access}
            return node["unique_id"], node

        nodes = dict(
            [
                resource("proj_bank", "proj_bank_base", "model", "public"),
                resource("proj_bank", "proj_bank_public_seed", "seed", "public"),
                resource("proj_bank", "proj_bank_seed", "seed", None),
                resource("proj_bank", "proj_bank_history", "snapshot", "public"),
                resource(
                    scale_additions.PACKAGE_NAME, "pkg_shared_seed", "seed", "public"
                ),
                resource(
                    scale_additions.PACKAGE_NAME,
                    "pkg_shared_history",
                    "snapshot",
                    "public",
                ),
                resource(
                    scale_additions.PACKAGE_NAME, "pkg_shared_model", "model", "public"
                ),
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)
            (store / "proj_bank").mkdir()
            (store / "proj_bank" / "manifest.json").write_text(
                json.dumps({"metadata": {"project_name": "proj_bank"}, "nodes": nodes}),
                encoding="utf-8",
            )
            nodes_path = store / "nodes.json"
            self.assertEqual(scale.write_injection(store, ["proj_bank"], nodes_path), 3)
            summary = json.loads(nodes_path.with_suffix(".summary.json").read_text())
            self.assertEqual(summary["package_nodes_omitted"], 3)
            self.assertEqual(
                summary["injected_by_type"], {"model": 1, "seed": 1, "snapshot": 1}
            )
            self.assertEqual(summary["non_public_seeds_omitted"], 1)
            injected = json.loads(nodes_path.read_text(encoding="utf-8"))
            self.assertTrue(
                all(node["package_name"] == "proj_bank" for node in injected)
            )

    def test_delta_against_the_previous_public_only_run(self):
        case = {
            "fixture": "large-org",
            "source_count": 19,
            "models": 49,
            "manifest_model_nodes": 49,
            "artefact_bytes_total": 120,
            "artefact_bytes_per_source": [
                {"source": "proj_a", "bytes": 70},
                {"source": "proj_b", "bytes": 50},
            ],
            "injected_node_count": 80,
            "injected_payload_bytes": 20000,
            "public_injected_node_count": 80,
            "peak_rss_bytes": 150,
            "parse_seconds": 2.6,
            "climb": {"injector_peak_rss_bytes": 90, "injector_seconds": 0.1},
            "baseline": {
                "checkout_bytes_total": 30,
                "parse_seconds": 50.0,
                "peak_rss_bytes": 140,
            },
            "withheld": {"parse_seconds": 2.4, "peak_rss_bytes": 130},
        }
        prior = {
            "fixtures": [
                {
                    "fixture": "large-org",
                    "artefact_bytes_total": 100,
                    "injected_node_count": 44,
                    "injected_payload_bytes": 12000,
                    "peak_rss_bytes": 100,
                    "parse_seconds": 2.5,
                    "injector_peak_rss_bytes": 80,
                    "injector_seconds": 0.1,
                    "baseline_checkout_bytes": 20,
                    "baseline_parse_seconds": 48.5,
                    "baseline_peak_rss_bytes": 130,
                    "withheld_parse_seconds": 2.4,
                    "withheld_peak_rss_bytes": 120,
                }
            ],
            "artefact_bytes_per_source": {"large-org": {"proj_a": 60, "proj_b": 50}},
        }
        delta = scale.delta_vs_previous(case, prior)
        self.assertEqual(delta["delta"]["artefact_bytes_total"], 20)
        self.assertEqual(delta["delta"]["peak_rss_bytes"], 50)
        self.assertEqual(delta["delta"]["injected_node_count"], 36)
        self.assertEqual(
            delta["artefact_bytes_per_source_delta"], {"proj_a": 10, "proj_b": 0}
        )
        self.assertIsNone(
            scale.delta_vs_previous(
                {"fixture": "full", "artefact_bytes_per_source": []}, prior
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-good-scale.json"
            path.write_text(
                json.dumps(
                    {
                        "injection_policy": "access-public",
                        "toolchain": {"packages": {}},
                        "fixtures": [case],
                    }
                ),
                encoding="utf-8",
            )
            previous = scale.previous_public_only(path)
            self.assertEqual(previous["fixtures"][0]["artefact_bytes_total"], 120)
            self.assertEqual(
                previous["artefact_bytes_per_source"]["large-org"],
                {"proj_a": 70, "proj_b": 50},
            )
            path.write_text(
                json.dumps(
                    {
                        "injection_policy": "access-public",
                        "scale_additions": {"consumer": "proj_core"},
                        "previous_public_only": previous,
                        "fixtures": [],
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(scale.previous_public_only(path), previous)
        machine = scale.machine_info()
        self.assertTrue(machine["hostname"])
        self.assertIsInstance(machine["cpu_count"], int)

    def test_gnu_time_rss_is_kilobytes(self):
        match = climb.GNU_TIME_RSS.search("Maximum resident set size (kbytes): 2048\n")
        self.assertIsNotNone(match)
        self.assertEqual(int(match.group(1)) * 1024, 2048 * 1024)


if __name__ == "__main__":
    unittest.main()
