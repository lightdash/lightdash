import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ambiguous_version_fixture as fixture
import prod_shaped_fixture as control
from ambiguous_version_observation import diagnostics

WORK = ROOT / ".work/large-org" / fixture.VARIANT
RUNTIME = WORK / "fixtures" / fixture.VARIANT


class AmbiguousVersionFixtureTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="ambiguous-version-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / "fixture"

    def test_only_one_control_edge_changes_and_becomes_unpinned(self):
        registry = fixture.generate(self.root)
        scenario = registry["scenario"]
        self.assertEqual(scenario["controlCycle"], control.cycle_graph())
        self.assertEqual(scenario["controlCycle"]["modelCount"], 14)
        self.assertEqual(scenario["controlCycle"]["projectCount"], 3)
        self.assertEqual(
            sum(
                node.endswith(".v3")
                for node in scenario["controlCycle"]["closedUniqueIds"][:-1]
            ),
            4,
        )
        self.assertEqual(len(scenario["ambiguousEdges"]), 1)
        edge = scenario["ambiguousEdges"][0]
        self.assertEqual(edge["ref"], ["proj_payments", "transactions"])
        self.assertEqual(edge["refArgumentCount"], 2)
        self.assertIsNone(edge["version"])
        sql = (self.root / "repos/proj_bank/models/stg_bank_accounts.sql").read_text()
        self.assertIn("ref('proj_payments', 'transactions')", sql)
        self.assertNotIn("v=", sql)
        for edge in scenario["controlCycle"]["edges"]:
            if edge["fromUniqueId"] == fixture.CONSUMER:
                continue
            reference = next(
                ref for ref in scenario["refs"] if ref["model"] == edge["from"]
            )
            self.assertEqual(
                (reference["ref"], reference["version"]), (edge["ref"], edge["version"])
            )
        self.assertEqual(scenario["freshGraph"]["leaf"], fixture.FRESH_TARGET)
        graph = {
            edge["fromUniqueId"]: {"depends_on": {"nodes": [edge["toUniqueId"]]}}
            for edge in scenario["freshGraph"]["edges"]
        }
        graph[fixture.FRESH_TARGET] = {"depends_on": {"nodes": []}}
        self.assertTrue(fixture.graph_evidence(graph)["acyclic"])
        graph[fixture.CONSUMER]["depends_on"]["nodes"] = [fixture.OLD_TARGET]
        self.assertFalse(fixture.graph_evidence(graph)["acyclic"])

    def test_fresh_schema_versions_leaf_and_decoys(self):
        registry = fixture.generate(self.root)
        self.assertEqual(registry["stats"]["sourceCount"], 19)
        self.assertEqual(registry["stats"]["totalModels"], 41)
        self.assertEqual(registry["stats"]["totalModelNodes"], 42)
        schema = json.loads(
            (self.root / "repos/proj_payments/models/schema.yml").read_text()
        )
        transaction = next(
            model for model in schema["models"] if model["name"] == "transactions"
        )
        self.assertEqual(transaction["versions"], [{"v": 2}, {"v": 3}])
        self.assertEqual(transaction["latest_version"], 2)
        leaf = (
            self.root / "repos/proj_payments/models/transactions_v2.sql"
        ).read_text()
        self.assertIn("ref('proj_payments_seed')", leaf)
        self.assertNotIn("int_payment_events", leaf)
        branch = (
            self.root / "repos/proj_payments/models/transactions_v3.sql"
        ).read_text()
        self.assertIn("ref('int_payment_events')", branch)
        for model in control.DECOYS:
            project, name = model.split(".")
            schema = json.loads(
                (self.root / "repos" / project / "models/schema.yml").read_text()
            )
            decoy = next(item for item in schema["models"] if item["name"] == name)
            self.assertNotIn("versions", decoy)
            self.assertNotIn("latest_version", decoy)
        expected = registry["scenario"]["expectedResults"]
        self.assertEqual(
            set(expected), {"pre", "fixed", "main", "cycle-pr", "integrated"}
        )
        self.assertTrue(
            all(
                row["refresh_success"] and not row["cycle_error"]
                for row in expected.values()
            )
        )

    def test_stale_consumer_import_is_separate_from_fresh_publication(self):
        registry = fixture.generate(self.root)
        edge = registry["scenario"]["ambiguousEdges"][0]
        loom = json.loads(
            (self.root / "repos/proj_bank/dbt_loom.config.yml").read_text()
        )
        publication = next(
            item for item in loom["manifests"] if item["name"] == "proj_payments"
        )
        self.assertEqual(publication["config"]["path"], edge["stalePublicationPath"])
        self.assertNotEqual(edge["stalePublicationPath"], edge["freshPublicationPath"])
        first = {
            str(path.relative_to(self.root)): path.read_bytes()
            for path in self.root.rglob("*")
            if path.is_file()
        }
        fixture.generate(self.root)
        self.assertEqual(
            first,
            {
                str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob("*")
                if path.is_file()
            },
        )

    def test_new_version_path_cannot_escape(self):
        outside = Path(self.directory.name) / "outside"
        outside.write_text("untouched")
        leaf = self.root / "repos/proj_payments/models/transactions_v2.sql"
        leaf.parent.mkdir(parents=True)
        leaf.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "escapes"):
            fixture.generate(self.root)
        self.assertEqual(outside.read_text(), "untouched")

    def test_dbt_diagnostics_use_the_measured_log_window(self):
        log = Path(self.directory.name) / "api.log"
        nested = json.dumps(
            {
                "info": {
                    "name": "MainEncounteredError",
                    "level": "error",
                    "msg": "exact failure",
                    "ts": "2026-10-22T23:00:01Z",
                }
            }
        )
        records = [
            {
                "timestamp": timestamp,
                "level": "error",
                "message": "command failed\n" + nested,
            }
            for timestamp in (
                "2026-10-22 22:59:59",
                "2026-10-22 23:00:01",
                "2026-10-22 23:00:03",
            )
        ]
        log.write_text("".join(json.dumps(row) + "\n" for row in records))
        captured = diagnostics({log: 0}, "2026-10-22 23:00:00", "2026-10-22 23:00:02")
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0]["message"], "exact failure")


class AmbiguousVersionEvidenceTests(unittest.TestCase):
    @unittest.skipUnless(
        (RUNTIME / "provenance.json").exists(),
        "Run real dbt publication preparation first",
    )
    def test_real_publication_and_binding_provenance(self):
        evidence = json.loads((RUNTIME / "provenance.json").read_text())
        for relative, expected in evidence["artifact_hashes"].items():
            self.assertEqual(fixture.digest(RUNTIME / relative), expected)
        for label, latest in (("old_publication", 3), ("fresh_publication", 2)):
            record = evidence[label]
            manifest = json.loads((RUNTIME / record["manifest_path"]).read_text())
            self.assertEqual(record["latest_version"], latest)
            self.assertEqual(
                manifest["nodes"][fixture.OLD_TARGET]["latest_version"], latest
            )
            self.assertEqual(manifest["nodes"][fixture.FRESH_TARGET]["version"], 2)
            self.assertTrue(
                manifest["nodes"][fixture.OLD_TARGET]["depends_on"]["nodes"]
            )
        self.assertEqual(
            evidence["initial_consumer_binding"]["dependencies"], [fixture.OLD_TARGET]
        )
        self.assertEqual(
            evidence["fresh_control_binding"]["dependencies"], [fixture.FRESH_TARGET]
        )
        self.assertEqual(len(set(evidence["initial_combined_graph"]["cycle"])), 14)
        self.assertTrue(evidence["fresh_combined_graph"]["acyclic"])
        self.assertEqual(evidence["fresh_combined_graph"]["modelCount"], 42)
        self.assertEqual(
            evidence["fresh_combined_graph"]["edges"][fixture.FRESH_TARGET], []
        )
        self.assertEqual(
            evidence["fresh_combined_graph"]["edges"][fixture.CONSUMER],
            [fixture.FRESH_TARGET],
        )
        real_nodes = {}
        for record in evidence["parse_records"]:
            if record["stage"] in ("old-provider", "consumer-stale-publication"):
                continue
            manifest = json.loads((RUNTIME / record["manifest_path"]).read_text())
            real_nodes.update(fixture.local_nodes(manifest, record["project"]))
        self.assertEqual(
            fixture.graph_evidence(real_nodes), evidence["fresh_combined_graph"]
        )
        self.assertEqual(
            [
                dependency
                for node in real_nodes.values()
                for dependency in node["depends_on"]["nodes"]
                if dependency.startswith("model.") and dependency not in real_nodes
            ],
            [],
        )
        self.assertIn(fixture.OLD_TARGET, evidence["fresh_combined_graph"]["edges"])
        self.assertEqual(
            sum(
                key.endswith(".v3") for key in evidence["fresh_combined_graph"]["edges"]
            ),
            4,
        )
        for decoy in control.DECOYS:
            self.assertIn("model." + decoy, evidence["fresh_combined_graph"]["edges"])
            self.assertFalse(
                any(
                    key.startswith("model." + decoy + ".v")
                    for key in evidence["fresh_combined_graph"]["edges"]
                )
            )

    @unittest.skipUnless(
        (WORK / "results.json").exists(), "Run measured refreshes first"
    )
    def test_results_replay_without_rewriting_product_outcomes(self):
        for row in json.loads((WORK / "results.json").read_text())["runs"]:
            self.assertEqual(fixture.evaluate(row), row["assertions"])
            self.assertTrue(
                row["configured"]["expectedResults"][row["build"]]["refresh_success"]
            )
            self.assertEqual(
                row["assertions"]["observed"]["refresh_success"],
                row["operation"]["success"],
            )
            if not row["operation"]["success"]:
                self.assertFalse(row["assertions"]["pass"])


if __name__ == "__main__":
    unittest.main()
