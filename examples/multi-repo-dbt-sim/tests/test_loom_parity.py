import json
import sys
import tempfile
import unittest
from pathlib import Path

PARITY = Path(__file__).resolve().parents[1] / "loom-parity"
sys.path.insert(0, str(PARITY))

import combo
import loomfuzz
import seed_cases

SEED_IDS = {
    "S1a-both-public",
    "S1b-unique",
    "S2a-onearg-public-vs-protected",
    "S2b-explicit-protected",
    "S3-only-nonpublic",
    "S4-public-seed-snapshot",
    "S5-protected-seed",
    "S6-latest-version",
    "S7-explicit-v2",
    "S7b-missing-v3",
    "S8-ordered-chain",
    "S9-cold-ring",
    "S9b-model-cycle-seeded",
    "S9c-cycle-via-protected",
    "S10-withheld",
    "S12-protected-sibling-edge",
    "S13-packages",
    "S14-optional",
    "S15-zero-sources",
}


class LoomParityFixtureTests(unittest.TestCase):
    def test_seed_cases_cover_the_matrix_ids(self):
        ids = {case["id"] for case in seed_cases.CASES}
        self.assertTrue(SEED_IDS <= ids, SEED_IDS - ids)

    def test_server_shaped_requirements_exclude_loom(self):
        server = (PARITY.parent / "last-good-climb" / "requirements.txt").read_text()
        loom = (PARITY / "requirements-loom.txt").read_text()
        self.assertNotIn("dbt-loom", server)
        self.assertIn("dbt-loom==0.9.6", loom)
        self.assertIn("dbt-core==1.12.0", loom)

    def test_ref_sql_shapes(self):
        self.assertEqual(
            loomfuzz.ref_sql((None, "orders", None)), "{{ ref('orders') }}"
        )
        self.assertEqual(
            loomfuzz.ref_sql(("provider_a", "orders", None)),
            "{{ ref('provider_a', 'orders') }}",
        )
        self.assertEqual(
            loomfuzz.ref_sql(("provider_a", "measure", 2)),
            "{{ ref('provider_a', 'measure', v=2) }}",
        )

    def test_loom_config_carries_package_and_optional_knobs(self):
        config = json.loads(
            loomfuzz.loom_config(
                Path("/store"),
                [
                    {"name": "provider_a", "included_packages": ["provider_a"]},
                    {"name": "ghost", "optional": True},
                ],
            )
        )
        self.assertEqual(config["manifests"][0]["included_packages"], ["provider_a"])
        self.assertEqual(config["manifests"][0]["type"], "file")
        self.assertTrue(config["manifests"][1]["optional"])
        self.assertNotIn("excluded_packages", config["manifests"][0])

    def test_fix7b_payload_withholds_non_public_and_restricts_edges(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)
            (store / "provider_a").mkdir()
            manifest = {
                "nodes": {
                    "model.provider_a.hidden": {
                        "unique_id": "model.provider_a.hidden",
                        "resource_type": "model",
                        "name": "hidden",
                        "package_name": "provider_a",
                        "path": "hidden.sql",
                        "schema": "s",
                        "access": "protected",
                        "depends_on": {"nodes": []},
                    },
                    "model.provider_a.orders": {
                        "unique_id": "model.provider_a.orders",
                        "resource_type": "model",
                        "name": "orders",
                        "package_name": "provider_a",
                        "path": "orders.sql",
                        "schema": "s",
                        "access": "public",
                        "depends_on": {
                            "nodes": ["model.provider_a.hidden", "seed.provider_a.s"]
                        },
                    },
                    "seed.provider_a.s": {
                        "unique_id": "seed.provider_a.s",
                        "resource_type": "seed",
                        "name": "s",
                        "package_name": "provider_a",
                        "path": "s.csv",
                        "schema": "s",
                        "config": {"access": "public"},
                        "depends_on": {"nodes": []},
                    },
                    "model.other.external": {
                        "unique_id": "model.other.external",
                        "resource_type": "model",
                        "name": "external",
                        "package_name": "other",
                        "path": "",
                        "schema": "s",
                        "access": "public",
                        "depends_on": {"nodes": []},
                    },
                }
            }
            (store / "provider_a" / "manifest.json").write_text(json.dumps(manifest))
            payload = loomfuzz.fix7b_payload(store, ["provider_a", "missing"])
        ids = {
            f"{node.get('resource_type', 'model')}.{node['package_name']}.{node['name']}"
            for node in payload
        }
        self.assertEqual(ids, {"model.provider_a.orders", "seed.provider_a.s"})
        orders = next(node for node in payload if node["name"] == "orders")
        self.assertEqual(orders["depends_on_nodes"], ["seed.provider_a.s"])

    def test_combo_generator_is_deterministic_and_anonymous(self):
        first = combo.gen(42)
        second = combo.gen(42)
        self.assertEqual(first, second)
        names = {project["name"] for project in first["projects"]}
        self.assertTrue(
            all(name.startswith(("provider_", "consumer_")) for name in names), names
        )
        self.assertNotEqual(combo.gen(42), combo.gen(43))

    def test_known_divergence_table_names_every_gap_class(self):
        for key, verdict in combo.KNOWN.items():
            self.assertEqual(len(key), 2)
            self.assertIsInstance(verdict, str)
        self.assertIn(("access-denied", "unresolved"), combo.KNOWN)
        self.assertIn(("error", "pass"), combo.KNOWN)

    def test_classify_distinguishes_loom_crash_from_dbt_errors(self):
        crash = {
            "returncode": 2,
            "output": "Traceback (most recent call last):\nLoomConfigurationError",
        }
        denied = {
            "returncode": 2,
            "output": "which is not allowed because the referenced node is protected to the 'x' package.",
        }
        unresolved = {
            "returncode": 2,
            "output": "depends on a node named 'a' which was not found",
        }
        self.assertEqual(loomfuzz.classify(crash), "crash")
        self.assertEqual(loomfuzz.classify(denied), "access-denied")
        self.assertEqual(loomfuzz.classify(unresolved), "unresolved")
        self.assertEqual(loomfuzz.classify({"returncode": 0, "output": ""}), "pass")


if __name__ == "__main__":
    unittest.main()
