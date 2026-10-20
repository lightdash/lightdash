import {
    DbtError,
    SupportedDbtVersions,
    type DbtExternalModelNode,
} from '@lightdash/common';
import * as fs from 'fs/promises';
import path from 'path';
import { DbtSourceError } from './DbtSourceError';

export const DBT_EXTERNAL_NODES_PLUGIN_FILENAME =
    'dbt_lightdash_external_nodes.py';

export const DBT_EXTERNAL_NODES_PLUGIN_SOURCE = `import json
import os

from dbt.contracts.graph.node_args import ModelNodeArgs
from dbt.plugins.manager import dbt_hook, dbtPlugin
from dbt.plugins.manifest import PluginNodes


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
                ModelNodeArgs(
                    name=raw["name"],
                    package_name=raw["package_name"],
                    identifier=raw["identifier"],
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
`;

export const writeDbtExternalNodesPlugin = async (
    directory: string,
    nodes: DbtExternalModelNode[],
): Promise<{ PYTHONPATH: string; LIGHTDASH_DBT_EXTERNAL_NODES: string }> => {
    const pluginDirectory = path.join(directory, 'dbt_external_nodes');
    const nodesPath = path.join(pluginDirectory, 'external_nodes.json');
    await fs.mkdir(pluginDirectory, { recursive: true });
    await Promise.all([
        fs.writeFile(
            path.join(pluginDirectory, DBT_EXTERNAL_NODES_PLUGIN_FILENAME),
            DBT_EXTERNAL_NODES_PLUGIN_SOURCE,
            'utf8',
        ),
        fs.writeFile(nodesPath, JSON.stringify(nodes), 'utf8'),
    ]);
    return {
        PYTHONPATH: pluginDirectory,
        LIGHTDASH_DBT_EXTERNAL_NODES: nodesPath,
    };
};

export const parseMissingDbtNodeReferences = (
    output: string,
): { model: string; packageName: string; version: string | null }[] => [
    ...new Map(
        Array.from(
            output.matchAll(
                /depends on a node named '([^']+)'(?: with version '([^']*)')? in package or project '([^']+)'(?: with version '([^']*)')? which was not found/g,
            ),
            ([, model, modelVersion, packageName, projectVersion]) => ({
                model,
                packageName,
                version: modelVersion ?? projectVersion ?? null,
            }),
        ).map((ref) => [
            `${ref.packageName}.${ref.model}.${ref.version ?? ''}`,
            ref,
        ]),
    ).values(),
];

export const getMissingDbtNodeReferences = (
    error: unknown,
): { model: string; packageName: string; version: string | null }[] => {
    const output = [
        error instanceof Error ? error.message : '',
        ...(error instanceof DbtError || error instanceof DbtSourceError
            ? (error.logs ?? []).map((log) => log.info.msg)
            : []),
    ].join('\n');
    return [
        ...new Map(
            parseMissingDbtNodeReferences(output).map((ref) => [
                `${ref.packageName}.${ref.model}.${ref.version ?? ''}`,
                ref,
            ]),
        ).values(),
    ];
};

export const dbtSupportsExternalNodes = (
    version: SupportedDbtVersions,
): boolean =>
    version !== SupportedDbtVersions.V1_4 &&
    version !== SupportedDbtVersions.V1_5;

export const CROSS_SOURCE_REFS_HINT =
    'This model references a model in another dbt project. Connect that project as a dbt source and enable cross-source dbt refs for your organization.';

export const withCrossSourceRefsHint = (
    error: unknown,
    enabled: boolean,
): unknown => {
    if (
        !enabled &&
        error instanceof Error &&
        getMissingDbtNodeReferences(error).length > 0 &&
        !error.message.includes(CROSS_SOURCE_REFS_HINT)
    ) {
        const hintedError = error;
        hintedError.message = `${error.message} ${CROSS_SOURCE_REFS_HINT}`;
    }
    return error;
};
