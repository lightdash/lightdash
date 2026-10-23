import json
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
        self.assertNotIn("lightdash_placeholder", plugin)
        self.assertNotIn("hashlib", plugin)
        self.assertIn('identifier=raw["identifier"]', plugin)
        self.assertTrue(
            (FIXTURE / "dbt_lightdash_external_nodes.py").name.startswith("dbt_")
        )

    def test_refresh_command_is_server_ls_and_seed_stays_parse(self):
        self.assertEqual(
            climb.REFRESH_COMMAND,
            ("ls", "--output", "json", "--output-keys", "unique_id"),
        )
        self.assertEqual(climb.MANIFEST_COMMAND, ("parse",))
        refresh = climb.dbt_argv(
            "dbt",
            climb.DISK / "proj_alpha",
            Path("/tmp/last-good-target"),
            command=climb.REFRESH_COMMAND,
        )
        self.assertEqual(
            refresh[:8],
            [
                "dbt",
                "--no-use-colors",
                "--no-partial-parse",
                "ls",
                "--output",
                "json",
                "--output-keys",
                "unique_id",
            ],
        )
        seed = climb.dbt_argv(
            "dbt",
            climb.SEED / "proj_alpha",
            Path("/tmp/last-good-target"),
            command=climb.MANIFEST_COMMAND,
        )
        self.assertEqual(seed[3], "parse")
        self.assertNotIn("--output-keys", seed)

    def test_duplicate_shared_package_id_fails_before_dbt(self):
        def model(package, name, version=None):
            suffix = "" if version is None else f".v{version}"
            return {
                "resource_type": "model",
                "path": f"{name}.sql",
                "original_file_path": f"models/{name}.sql",
                "access": "public",
                "name": name,
                "package_name": package,
                "unique_id": f"model.{package}.{name}{suffix}",
                "alias": name,
                "schema": "analytics",
                "database": None,
                "relation_name": None,
                "version": version,
                "latest_version": version,
                "depends_on": {"nodes": []},
            }

        def seed(name):
            node = model("shared_pkg", name)
            node["resource_type"] = "seed"
            node["unique_id"] = f"seed.shared_pkg.{name}"
            return node

        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)

            def publish(project, nodes):
                path = store / project / "manifest.json"
                path.parent.mkdir(exist_ok=True)
                path.write_text(json.dumps({"nodes": nodes}), encoding="utf-8")

            shared = model("shared_pkg", "shared_model")
            publish(
                "proj_a",
                {
                    "model.proj_a.local": model("proj_a", "local"),
                    shared["unique_id"]: shared,
                },
            )
            publish(
                "proj_b",
                {
                    "model.proj_b.local": model("proj_b", "local"),
                    shared["unique_id"]: shared,
                },
            )
            with self.assertRaises(climb.DuplicateInjectedIdError) as caught:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                str(caught.exception),
                'External model "model.shared_pkg.shared_model" is provided by '
                'several dbt sources: "proj_a", "proj_b". Connect only one '
                "source for this model.",
            )
            versioned = model("shared_pkg", "shared_model", 3)
            publish("proj_a", {versioned["unique_id"]: versioned})
            publish("proj_b", {versioned["unique_id"]: versioned})
            with self.assertRaises(climb.DuplicateInjectedIdError) as versioned_hit:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertIn(
                "model.shared_pkg.shared_model.v3", str(versioned_hit.exception)
            )
            lookup = seed("lookup")
            publish("proj_a", {lookup["unique_id"]: lookup})
            publish("proj_b", {lookup["unique_id"]: lookup})
            with self.assertRaises(climb.DuplicateInjectedIdError) as seed_hit:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertIn("seed.shared_pkg.lookup", str(seed_hit.exception))
            older = model("shared_pkg", "shared_model", 2)
            newer = model("shared_pkg", "shared_model", 3)
            publish("proj_a", {older["unique_id"]: older})
            publish("proj_b", {newer["unique_id"]: newer})
            injected = climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                sorted(node["version"] for node in injected),
                [2, 3],
            )
            publish(
                "proj_a",
                {"model.proj_a.orders": model("proj_a", "orders")},
            )
            publish(
                "proj_b",
                {"model.proj_b.orders": model("proj_b", "orders")},
            )
            distinct = climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                sorted(climb.canonical_injected_id(node) for node in distinct),
                ["model.proj_a.orders", "model.proj_b.orders"],
            )


if __name__ == "__main__":
    unittest.main()
