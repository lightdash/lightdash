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
            "nodes": {
                "model.pkg.pub": _node("pub", "public"),
                "model.pkg.priv": _node("priv", "protected"),
            }
        }
        manifest["nodes"]["model.pkg.hidden"] = _node("hidden", "private")
        manifest["nodes"]["model.pkg.unset"] = _node("unset", None)
        manifest["nodes"]["model.pkg.pub"]["depends_on"] = {
            "nodes": ["model.pkg.priv", "model.pkg.hidden", "model.pkg.unset"]
        }
        selected = climb.external_nodes(manifest)
        self.assertEqual([node["name"] for node in selected], ["pub"])
        self.assertEqual(selected[0]["depends_on_nodes"], [])

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

    def test_gnu_time_rss_is_kilobytes(self):
        match = climb.GNU_TIME_RSS.search("Maximum resident set size (kbytes): 2048\n")
        self.assertIsNotNone(match)
        self.assertEqual(int(match.group(1)) * 1024, 2048 * 1024)


if __name__ == "__main__":
    unittest.main()
