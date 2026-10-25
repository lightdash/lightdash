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

            def publish(project, nodes, owner=None):
                path = store / project / "manifest.json"
                path.parent.mkdir(exist_ok=True)
                metadata = {} if owner is None else {"project_name": owner}
                path.write_text(
                    json.dumps({"metadata": metadata, "nodes": nodes}),
                    encoding="utf-8",
                )

            shared = model("shared_pkg", "shared_model")
            publish(
                "proj_a",
                {
                    "model.proj_a.local": model("proj_a", "local"),
                    shared["unique_id"]: shared,
                },
                "proj_a",
            )
            publish(
                "proj_b",
                {
                    "model.proj_b.local": model("proj_b", "local"),
                    shared["unique_id"]: shared,
                },
                "proj_b",
            )
            package_shared = climb.injection_report(store, ["proj_a", "proj_b"])
            self.assertEqual(
                sorted(
                    climb.canonical_injected_id(node)
                    for node in package_shared["nodes"]
                ),
                ["model.proj_a.local", "model.proj_b.local"],
            )
            self.assertEqual(package_shared["owned_injected"], 2)
            self.assertEqual(package_shared["package_nodes_omitted"], 2)
            self.assertEqual(
                package_shared["owners"], {"proj_a": "proj_a", "proj_b": "proj_b"}
            )
            publish("proj_a", {shared["unique_id"]: shared}, "shared_pkg")
            publish("proj_b", {shared["unique_id"]: shared}, "shared_pkg")
            with self.assertRaises(climb.DuplicateInjectedIdError) as caught:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                str(caught.exception),
                'External model "model.shared_pkg.shared_model" is provided by '
                'several dbt sources: "proj_a", "proj_b". Connect only one '
                "source for this model.",
            )
            versioned = model("shared_pkg", "shared_model", 3)
            publish("proj_a", {versioned["unique_id"]: versioned}, "shared_pkg")
            publish("proj_b", {versioned["unique_id"]: versioned}, "shared_pkg")
            with self.assertRaises(climb.DuplicateInjectedIdError) as versioned_hit:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertIn(
                "model.shared_pkg.shared_model.v3", str(versioned_hit.exception)
            )
            lookup = seed("lookup")
            publish("proj_a", {lookup["unique_id"]: lookup}, "shared_pkg")
            publish("proj_b", {lookup["unique_id"]: lookup}, "shared_pkg")
            with self.assertRaises(climb.DuplicateInjectedIdError) as seed_hit:
                climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertIn("seed.shared_pkg.lookup", str(seed_hit.exception))
            older = model("shared_pkg", "shared_model", 2)
            newer = model("shared_pkg", "shared_model", 3)
            publish("proj_a", {older["unique_id"]: older}, "shared_pkg")
            publish("proj_b", {newer["unique_id"]: newer}, "shared_pkg")
            injected = climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                sorted(node["version"] for node in injected),
                [2, 3],
            )
            publish(
                "proj_a",
                {"model.proj_a.orders": model("proj_a", "orders")},
                "proj_a",
            )
            publish(
                "proj_b",
                {"model.proj_b.orders": model("proj_b", "orders")},
                "proj_b",
            )
            distinct = climb.injection_for(store, ["proj_a", "proj_b"])
            self.assertEqual(
                sorted(climb.canonical_injected_id(node) for node in distinct),
                ["model.proj_a.orders", "model.proj_b.orders"],
            )

    def test_projection_exports_only_project_owned_public_nodes(self):
        def node(package, name, access="public", resource_type="model"):
            return {
                "resource_type": resource_type,
                "path": f"{name}.sql",
                "original_file_path": f"models/{name}.sql",
                "access": access,
                "name": name,
                "package_name": package,
                "unique_id": f"{resource_type}.{package}.{name}",
                "alias": name,
                "schema": "analytics",
                "database": None,
                "relation_name": None,
                "version": None,
                "latest_version": None,
                "depends_on": {"nodes": ["model.shared_pkg.shared_model"]},
            }

        manifest = {
            "metadata": {"project_name": "proj_owner"},
            "nodes": {
                "model.proj_owner.shared_model": node("proj_owner", "shared_model"),
                "seed.proj_owner.lookup": node(
                    "proj_owner", "lookup", resource_type="seed"
                ),
                "model.proj_owner.hidden": node("proj_owner", "hidden", "protected"),
                "model.shared_pkg.shared_model": node("shared_pkg", "shared_model"),
                "seed.shared_pkg.pkg_lookup": node(
                    "shared_pkg", "pkg_lookup", resource_type="seed"
                ),
                "model.proj_other.external": {
                    **node("proj_other", "external"),
                    "path": None,
                    "original_file_path": None,
                },
            },
        }
        self.assertEqual(climb.owner_identity(manifest), "proj_owner")
        projected = {
            climb.canonical_injected_id(payload): payload
            for payload in climb.projection(manifest)
        }
        self.assertEqual(
            sorted(projected),
            ["model.proj_owner.shared_model", "seed.proj_owner.lookup"],
        )
        self.assertEqual(
            projected["model.proj_owner.shared_model"]["depends_on_nodes"],
            ["model.shared_pkg.shared_model"],
        )
        injected = climb.external_nodes(manifest)
        self.assertEqual([node["depends_on_nodes"] for node in injected], [[], []])
        self.assertEqual(climb.package_nodes_omitted(manifest), 2)
        self.assertEqual(
            [
                climb.canonical_injected_id(payload)
                for payload in climb.projection(manifest, "shared_pkg")
            ],
            ["model.shared_pkg.shared_model", "seed.shared_pkg.pkg_lookup"],
        )
        ownerless = {"metadata": {}, "nodes": manifest["nodes"]}
        self.assertIsNone(climb.owner_identity(ownerless))
        self.assertEqual(climb.external_nodes(ownerless), [])
        self.assertEqual(climb.package_nodes_omitted(ownerless), 0)
        self.assertEqual(climb.external_nodes({"nodes": manifest["nodes"]}), [])

    def test_package_fixture_installs_one_local_package_in_both_owners(self):
        for owner in climb.PACKAGE_OWNERS:
            packages = (climb.PACKAGE / owner / "packages.yml").read_text()
            self.assertEqual(packages, "packages:\n    - local: ../shared_pkg\n")
            project = (climb.PACKAGE / owner / "dbt_project.yml").read_text()
            self.assertIn(f"name: {owner}\n", project)
        self.assertFalse(
            (climb.PACKAGE / climb.PACKAGE_CONSUMER / "packages.yml").exists()
        )
        self.assertFalse((climb.PACKAGE / climb.PACKAGE_NAME / "packages.yml").exists())
        package_schema = (
            climb.PACKAGE / climb.PACKAGE_NAME / "models/schema.yml"
        ).read_text()
        self.assertIn("access: public", package_schema)
        for owner, model in zip(climb.PACKAGE_OWNERS, ("shared_model", "owned_other")):
            sql = (climb.PACKAGE / owner / "models" / f"{model}.sql").read_text()
            self.assertIn("ref('shared_pkg', 'shared_model')", sql)
        report = (
            climb.PACKAGE / climb.PACKAGE_CONSUMER / "models/report.sql"
        ).read_text()
        self.assertIn("ref('proj_owner_one', 'shared_model')", report)
        self.assertIn("ref('proj_owner_two', 'owned_other')", report)
        self.assertNotIn("shared_pkg", report)
        self.assertEqual(
            climb.PACKAGE_BINDINGS,
            {
                "report": [
                    "model.proj_owner_one.shared_model",
                    "model.proj_owner_two.owned_other",
                ]
            },
        )

    def _ring_manifest(self, owner, models):
        nodes = {}
        for name, version, latest in models:
            suffix = "" if version is None else f".v{version}"
            unique_id = f"model.{owner}.{name}{suffix}"
            nodes[unique_id] = {
                "resource_type": "model",
                "path": f"{name}.sql",
                "original_file_path": f"models/{name}.sql",
                "access": "public",
                "name": name,
                "package_name": owner,
                "unique_id": unique_id,
                "alias": name,
                "schema": "analytics",
                "database": None,
                "relation_name": None,
                "version": version,
                "latest_version": latest,
                "depends_on": {"nodes": []},
            }
        return {"metadata": {"project_name": owner}, "nodes": nodes}

    def _write_store(self, store, manifests):
        for project, manifest in manifests.items():
            path = climb.manifest_path(store, project)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(manifest), encoding="utf-8")

    def test_fresh_catalogue_wins_over_the_confirmed_store(self):
        seed_beta = self._ring_manifest("proj_beta", [("measure", 3, 3)])
        fresh_beta = self._ring_manifest(
            "proj_beta", [("measure", 2, 2), ("measure", 3, 2)]
        )
        seed_alpha = self._ring_manifest("proj_alpha", [("alpha_base", None, None)])
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory)
            self._write_store(store, {"proj_beta": seed_beta, "proj_alpha": seed_alpha})
            confirmed = climb.injection_report(store, ["proj_beta"])
            self.assertEqual(confirmed["catalog_sources"], {"proj_beta": "confirmed"})
            self.assertEqual(
                [
                    (node["version"], node["latest_version"])
                    for node in confirmed["nodes"]
                ],
                [(3, 3)],
            )
            fresh = climb.injection_report(
                store, ["proj_beta"], {"proj_beta": fresh_beta}
            )
            self.assertEqual(fresh["catalog_sources"], {"proj_beta": "fresh"})
            self.assertEqual(
                sorted(
                    (node["version"], node["latest_version"]) for node in fresh["nodes"]
                ),
                [(2, 2), (3, 2)],
            )
            unrelated = climb.injection_report(
                store, ["proj_beta"], {"proj_alpha": seed_alpha}
            )
            self.assertEqual(unrelated["catalog_sources"], {"proj_beta": "confirmed"})
            with self.assertRaises(FileNotFoundError):
                climb.injection_report(store, ["proj_gamma"], {"proj_beta": fresh_beta})
            self.assertEqual(
                climb.provider_catalogs(
                    store, ["proj_gamma"], {"proj_gamma": fresh_beta}
                ),
                {"proj_gamma": ("fresh", fresh_beta)},
            )

    def test_confirm_writes_only_healthy_providers(self):
        seed_alpha = self._ring_manifest("proj_alpha", [("alpha_base", None, None)])
        seed_beta = self._ring_manifest("proj_beta", [("measure", 3, 3)])
        fresh = {
            "proj_alpha": self._ring_manifest(
                "proj_alpha", [("alpha_base", None, None), ("alpha_report", None, None)]
            ),
            "proj_beta": self._ring_manifest(
                "proj_beta", [("measure", 2, 2), ("measure", 3, 2)]
            ),
        }
        for scenario, failed, unattributed, rows, changed, logged in (
            ("healthy", (), False, 2, ["proj_alpha", "proj_beta"], 1),
            ("other_source_error", ("proj_beta",), False, 1, ["proj_alpha"], 1),
            ("every_source_error", climb.PROJECTS, False, 0, [], 1),
            ("unattributed_error", (), True, None, [], 0),
        ):
            with (
                self.subTest(scenario=scenario),
                tempfile.TemporaryDirectory() as directory,
            ):
                store = Path(directory)
                self._write_store(
                    store, {"proj_alpha": seed_alpha, "proj_beta": seed_beta}
                )
                before = climb.store_digest(store)
                events = climb.EventLog()
                written = climb.confirm_fresh(
                    store, fresh, events, failed, unattributed
                )
                after = climb.store_digest(store)
                self.assertEqual(written, rows)
                self.assertEqual(
                    sorted(p for p in climb.PROJECTS if after[p] != before[p]), changed
                )
                self.assertEqual(len(events.named(climb.CONFIRMED_EVENT)), logged)
                if logged:
                    self.assertEqual(
                        events.named(climb.CONFIRMED_EVENT)[0]["meta"]["rowsWritten"],
                        rows,
                    )
                self.assertEqual(climb.stray_temp_files(store), [])
                beta_latest = [
                    node["latest_version"]
                    for node in climb.projection(
                        climb.load_manifest(store, "proj_beta")
                    )
                ]
                self.assertEqual(beta_latest, [2, 2] if "proj_beta" in changed else [3])
        self.assertEqual(
            climb.CONFIRM_SCENARIOS["every_source_error"]["broken_explore"],
            climb.PROJECTS,
        )
        self.assertFalse(climb.CONFIRM_SCENARIOS["unattributed_error"]["attributed"])
        self.assertEqual(
            climb.CONFIRM_SCENARIOS["unattributed_error"]["broken_explore"],
            ("proj_beta",),
        )

    def test_confirm_on_an_unwritable_store_logs_the_cache_error(self):
        fresh = {
            "proj_alpha": self._ring_manifest(
                "proj_alpha", [("alpha_base", None, None)]
            )
        }
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / "store"
            store.write_text("not a directory", encoding="utf-8")
            events = climb.EventLog()
            self.assertIsNone(climb.confirm_fresh(store, fresh, events))
            self.assertEqual(events.named(climb.CONFIRMED_EVENT), [])
            cache_errors = events.named(climb.CACHE_ERROR_EVENT)
            self.assertEqual(len(cache_errors), 1)
            self.assertEqual(cache_errors[0]["message"], climb.CACHE_ERROR_EVENT)
            self.assertEqual(set(cache_errors[0]["meta"]), {"event", "message", "code"})
            self.assertEqual(cache_errors[0]["meta"]["code"], "ENOTDIR")
            self.assertEqual(store.read_text(encoding="utf-8"), "not a directory")

    def test_atomic_write_leaves_nothing_behind_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            blocker = Path(directory) / "published"
            blocker.write_text("occupied", encoding="utf-8")
            with self.assertRaises(OSError):
                climb.atomic_write_bytes(blocker / "explores.json", b"{}")
            self.assertEqual(
                sorted(p.name for p in Path(directory).iterdir()), ["published"]
            )
            target = Path(directory) / "artefacts" / "merged.json.gz"
            climb.atomic_write_bytes(target, b"first")
            climb.atomic_write_bytes(target, b"second")
            self.assertEqual(target.read_bytes(), b"second")
            self.assertEqual(climb.stray_temp_files(Path(directory)), [])

    def test_tmpfs_size_leaves_less_free_space_than_the_incoming_artefact(self):
        self.assertEqual(climb.tmpfs_bytes_short_of(b"x" * 3000, 3500), 4096)
        self.assertEqual(climb.tmpfs_bytes_short_of(b"x" * 5000, 9000), 8192 + 8192)
        self.assertEqual(climb.tmpfs_bytes_short_of(b"x" * 4096, 4096), 4096)

    def test_broken_explore_copy_parses_in_dbt_and_fails_lightdash_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = climb.write_broken_explore_copy(
                climb.DISK / "proj_beta", Path(directory) / "proj_beta"
            )
            schema = (copy / "models" / "bad_meta.yml").read_text(encoding="utf-8")
            self.assertIn("type: not_a_metric_type", schema)
            self.assertIn("access: protected", schema)
            self.assertEqual(
                (copy / "models" / "bad_meta.sql").read_text(encoding="utf-8"),
                "select 1 as id\n",
            )
            self.assertFalse(
                (climb.DISK / "proj_beta" / "models" / "bad_meta.sql").exists()
            )
            self.assertEqual(climb.sql_refs(copy)["bad_meta"], [])

    def test_missing_ref_parser_and_wording_mirror_the_product(self):
        output = (
            "Model 'model.proj_alpha.alpha_report' (models/alpha_report.sql) depends on a "
            "node named 'measure' in package or project 'proj_beta' which was not found\n"
            "Model 'model.proj_beta.broken' (models/broken.sql) depends on a node named "
            "'missing_model' which was not found\n"
            "Model 'model.a.b' (models/b.sql) depends on a node named 'dim' with version '4' "
            "in package or project 'other' which was not found\n"
            "Model 'model.a.b' (models/b.sql) depends on a node named 'dim' with version '4' "
            "in package or project 'other' which was not found\n"
        )
        self.assertEqual(
            climb.parse_missing_refs(output),
            [
                {"model": "measure", "packageName": "proj_beta", "version": None},
                {"model": "missing_model", "packageName": None, "version": None},
                {"model": "dim", "packageName": "other", "version": "4"},
            ],
        )
        self.assertEqual(climb.parse_missing_refs("nothing missing"), [])
        ref = {"model": "dim", "packageName": "versioned_ring_b", "version": "4"}
        self.assertEqual(climb.ref_label(ref), "ref('versioned_ring_b', 'dim', v=4)")
        self.assertEqual(
            climb.ref_label({"model": "measure", "packageName": None, "version": None}),
            "ref('measure')",
        )
        self.assertEqual(
            climb.missing_ref_reason(
                "versioned_ring_a", ref, "versioned_ring_b", "confirmed"
            ),
            "dbt source \"versioned_ring_a\" references ref('versioned_ring_b', 'dim', v=4), "
            'but the confirmed last-good manifest of dbt source "versioned_ring_b" does not '
            "define that model (or version).",
        )
        self.assertIn(
            "fresh manifest", climb.missing_ref_reason("a", ref, "b", "fresh")
        )
        self.assertTrue(
            climb.unresolved_ref_reason("a", ref).endswith(
                "Declare the upstream project in dependencies.yml or use a literal "
                "ref('project', 'model')."
            )
        )
        cold = climb.product_cold_start_reason(
            "proj_alpha", ref, "proj_beta", "proj_beta"
        )
        self.assertTrue(
            cold.startswith(
                'Cold start: dbt source "proj_alpha" references dbt source "proj_beta" (project "proj_beta")'
            )
        )
        self.assertTrue(cold.endswith("during its single parse."))
        self.assertEqual(
            climb.WITHHELD_MISSING_REFS["proj_alpha"],
            [{"model": "measure", "packageName": "proj_beta", "version": None}],
        )

    def test_broken_copy_adds_a_missing_ref_and_leaves_the_fixture_alone(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = climb.write_broken_copy(
                climb.DISK / "proj_beta", Path(directory) / "proj_beta"
            )
            broken = (copy / "models" / "broken.sql").read_text()
            self.assertEqual(broken, "select * from {{ ref('missing_model') }}\n")
            self.assertTrue((copy / "models" / "measure_v2.sql").is_file())
            self.assertFalse(
                (climb.DISK / "proj_beta" / "models" / "broken.sql").exists()
            )
            refs = climb.sql_refs(copy)
            self.assertEqual(
                refs["broken"],
                [{"package": None, "model": "missing_model", "version": None}],
            )

    def test_markers_match_the_product_text_and_meta(self):
        message, meta = climb.confirmed_message(2, "project", "original")
        self.assertEqual(
            message,
            "dbt.compile.crossSourceLastGoodConfirmed rowsWritten=2 "
            "projectUuid=project connectionGroup=original",
        )
        self.assertEqual(
            meta,
            {
                "event": "dbt.compile.crossSourceLastGoodConfirmed",
                "projectUuid": "project",
                "connectionGroup": "original",
                "rowsWritten": 2,
            },
        )
        self.assertIsNotNone(climb.CONFIRMED_PATTERN.match(message))
        sources = [{"name": "consumer", "injectedFrom": ["a", "b"], "injectedStubs": 2}]
        message, meta = climb.resolved_message(2, 2, sources)
        self.assertEqual(
            message,
            "dbt.compile.crossSourceRefsResolved diskEvictions=0 diskRecreations=0 "
            "ownedInjected=2 packageNodesOmitted=2",
        )
        self.assertTrue(message.endswith(" ownedInjected=2 packageNodesOmitted=2"))
        self.assertEqual(meta["event"], "dbt.compile.crossSourceRefsResolved")
        self.assertEqual(meta["ownedInjected"], 2)
        self.assertEqual(meta["packageNodesOmitted"], 2)
        self.assertEqual(meta["sources"], sources)
        self.assertIsNotNone(climb.RESOLVED_PATTERN.match(message))
        events = climb.EventLog()
        events.info(*climb.confirmed_message(2))
        events.info(*climb.resolved_message(4, 0, []))
        self.assertEqual(len(events.named(climb.CONFIRMED_EVENT)), 1)
        self.assertEqual(len(events.named(climb.RESOLVED_EVENT)), 1)
        self.assertEqual(climb.CONNECTION_GROUP, "original")

    def test_marker_assertions_reject_a_drifted_message(self):
        events = climb.EventLog()
        events.info(*climb.confirmed_message(2))
        events.info(*climb.confirmed_message(2))
        events.info(*climb.resolved_message(4, 0, []))
        events.info(*climb.resolved_message(2, 2, []))
        present = {"owned_injected": 4, "package_nodes_omitted": 0}
        package = {"owned_injected": 2, "package_nodes_omitted": 2}
        withheld = {"confirmations_logged": 0}
        self.assertEqual(climb.assert_markers(events, present, package, withheld), [])
        fresh = {
            "runs": {"alpha_first": {"owned_injected": 5, "package_nodes_omitted": 0}}
        }
        confirm = {
            "scenarios": {
                "other_source_error": {
                    "rows_written": 1,
                    "resolution": {"owned_injected": 5, "package_nodes_omitted": 0},
                },
                "unattributed_error": {
                    "rows_written": None,
                    "resolution": {"owned_injected": 5, "package_nodes_omitted": 0},
                },
            }
        }
        self.assertEqual(climb.expected_confirmations(confirm), [2, 2, 1])
        self.assertEqual(
            climb.expected_resolutions(present, package, fresh, confirm),
            [(4, 0), (2, 2), (5, 0), (5, 0), (5, 0)],
        )
        publication = {
            "scenarios": {
                "healthy_save": {
                    "rows_written": 2,
                    "resolution": {"owned_injected": 5, "package_nodes_omitted": 0},
                },
                "publication_failure": {
                    "rows_written": None,
                    "resolution": {"owned_injected": 5, "package_nodes_omitted": 0},
                },
            }
        }
        self.assertEqual(
            climb.expected_confirmations(confirm, publication), [2, 2, 1, 2]
        )
        self.assertEqual(
            climb.expected_resolutions(present, package, fresh, confirm, publication),
            [(4, 0), (2, 2), (5, 0), (5, 0), (5, 0), (5, 0), (5, 0)],
        )
        extended = climb.EventLog()
        extended.entries = json.loads(json.dumps(events.entries))
        extended.info(*climb.resolved_message(5, 0, []))
        extended.info(*climb.resolved_message(5, 0, []))
        extended.info(*climb.confirmed_message(1))
        extended.info(*climb.resolved_message(5, 0, []))
        self.assertEqual(
            climb.assert_markers(extended, present, package, withheld, fresh, confirm),
            [],
        )
        extended.info(*climb.confirmed_message(2))
        self.assertEqual(
            climb.assert_markers(extended, present, package, withheld, fresh, confirm),
            ["last-good confirmations were not logged once per confirmed store"],
        )
        drifted = climb.EventLog()
        drifted.entries = json.loads(json.dumps(events.entries))
        drifted.entries[0]["message"] = drifted.entries[0]["message"].replace(
            "rowsWritten=2", "rows=2"
        )
        drifted.entries[3]["meta"]["packageNodesOmitted"] = 0
        errors = climb.assert_markers(drifted, present, package, withheld)
        self.assertIn(
            "crossSourceLastGoodConfirmed marker does not match the product", errors
        )
        self.assertIn(
            "crossSourceRefsResolved counts do not match the resolutions", errors
        )
        self.assertEqual(
            climb.assert_markers(events, present, package, {"confirmations_logged": 1}),
            ["withheld run logged a last-good confirmation"],
        )


if __name__ == "__main__":
    unittest.main()
