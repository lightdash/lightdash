import hashlib
import json
import os
from dataclasses import dataclass

from dbt.contracts.graph.node_args import ModelNodeArgs
from dbt.plugins.manager import dbt_hook, dbtPlugin
from dbt.plugins.manifest import PluginNodes


@dataclass
class ExternalNodeArgs(ModelNodeArgs):
    resource_type: str = "model"

    @property
    def unique_id(self) -> str:
        unique_id = f"{self.resource_type}.{self.package_name}.{self.name}"
        if self.version is not None:
            unique_id = f"{unique_id}.v{self.version}"
        return unique_id


class LightdashExternalNodes(dbtPlugin):
    def initialize(self) -> None:
        path = os.environ.get("LIGHTDASH_DBT_EXTERNAL_NODES")
        self._nodes = []
        if not path:
            return
        with open(path, "r", encoding="utf-8") as handle:
            self._nodes = json.load(handle)

    @dbt_hook
    def get_nodes(self) -> PluginNodes:
        nodes = PluginNodes()
        for raw in self._nodes:
            if raw["package_name"] == self.project_name:
                continue
            nodes.add_model(
                ExternalNodeArgs(
                    resource_type=raw.get("resource_type") or "model",
                    name=raw["name"],
                    package_name=raw["package_name"],
                    identifier=(
                        "lightdash_"
                        + hashlib.sha256(
                            json.dumps(
                                [
                                    raw["package_name"],
                                    raw["name"],
                                    raw.get("version"),
                                ]
                            ).encode()
                        ).hexdigest()
                        if raw["schema"] == "lightdash_placeholder"
                        else raw["identifier"]
                    ),
                    schema=raw["schema"],
                    database=raw.get("database"),
                    relation_name=raw.get("relation_name"),
                    version=raw.get("version"),
                    latest_version=raw.get("latest_version"),
                    access=raw.get("access") or "protected",
                    depends_on_nodes=raw.get("depends_on_nodes") or [],
                    enabled=True,
                )
            )
        return nodes


plugins = [LightdashExternalNodes]
