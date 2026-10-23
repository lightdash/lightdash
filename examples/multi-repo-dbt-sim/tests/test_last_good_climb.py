import sys
import tempfile
import unittest
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "last-good-climb"
sys.path.insert(0, str(FIXTURE))

import climb


class LastGoodClimbFixtureTests(unittest.TestCase):
    def test_project_ring_has_no_model_cycle(self):
        self.assertIsNone(climb.find_cycle(climb.plain_model_graph(climb.DISK)))
        self.assertEqual(
            climb.find_cycle(climb.project_graph(climb.DISK)),
            ["proj_alpha", "proj_beta", "proj_alpha"],
        )
        self.assertEqual(
            climb.project_graph(climb.DISK),
            {"proj_alpha": ["proj_beta"], "proj_beta": ["proj_alpha"]},
        )

    def test_version_hop_is_unpinned_and_disk_latest_is_acyclic_v2(self):
        sql = (climb.DISK / "proj_alpha/models/alpha_report.sql").read_text()
        self.assertIn("ref('proj_beta', 'measure')", sql)
        self.assertNotIn("v=", sql)
        refs = climb.sql_refs(climb.DISK / "proj_beta")
        self.assertEqual(refs["measure.v2"], [])
        self.assertEqual(refs["measure.v3"], [])
        self.assertNotIn(
            "ref(", (climb.DISK / "proj_beta/models/measure_v2.sql").read_text()
        )
        disk = climb.latest_versions(
            (climb.DISK / "proj_beta/models/schema.yml").read_text()
        )
        seed = climb.latest_versions(
            (climb.SEED / "proj_beta/models/schema.yml").read_text()
        )
        self.assertEqual(disk["measure"], 2)
        self.assertEqual(seed["measure"], 3)
        self.assertEqual(
            climb.BINDINGS["proj_alpha"]["alpha_report"],
            ["model.proj_beta.measure.v3"],
        )

    def test_withheld_store_does_not_read_disk_or_invent_a_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            decoy = root / "disk" / "proj_beta" / "target"
            decoy.mkdir(parents=True)
            (decoy / "manifest.json").write_text("{}\n")
            store = root / "last-good"
            store.mkdir()
            missing = climb.missing_upstreams(store, climb.UPSTREAMS["proj_alpha"])
            self.assertEqual(missing, ["proj_beta"])
            warning = climb.cold_start_warning("proj_alpha", missing)
            self.assertIn('dbt source "proj_alpha"', warning)
            self.assertIn("proj_beta", warning)
            self.assertIn("No manifest was invented.", warning)
            self.assertEqual(climb.manifest_files(store), [])
            self.assertEqual(list(store.rglob("manifest.json")), [])

    def test_cold_start_names_every_unseeded_upstream(self):
        warning = climb.cold_start_warning("proj_beta", ["proj_alpha"])
        self.assertEqual(
            warning,
            'Cold start: dbt source "proj_beta" cannot refresh because '
            "last-good manifests are not seeded for upstreams: proj_alpha. "
            "Seed each upstream with a successful compile or deploy. "
            "No manifest was invented.",
        )

    def test_image_pins_exclude_loom(self):
        requirements = (FIXTURE / "requirements.txt").read_text()
        plugin = (FIXTURE / "dbt_lightdash_external_nodes.py").read_text()
        self.assertIn("dbt-core==1.12.0", requirements)
        self.assertNotIn("dbt-loom", requirements)
        self.assertNotIn("loom", plugin.lower())
        self.assertTrue(
            (FIXTURE / "dbt_lightdash_external_nodes.py").name.startswith("dbt_")
        )


if __name__ == "__main__":
    unittest.main()
