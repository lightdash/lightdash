import {
    InlineErrorType,
    isExploreError,
    type DbtManifest,
    type DbtNode,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

type TableLocation = { database: string; schema: string; sqlTable: string };

type ModelNode = DbtNode & {
    resource_type: 'model' | 'seed';
    name: string;
    database?: string | null;
    schema?: string;
    relation_name?: string | null;
    package_name?: string;
    original_file_path?: string;
    patch_path?: string | null;
};

const isModelNode = (node: DbtNode): node is ModelNode =>
    node.resource_type === 'model' || node.resource_type === 'seed';

/** Where each live model's table is, by model name. */
export const findLiveTableLocations = (
    explores: (Explore | ExploreError)[],
): Map<string, TableLocation> =>
    new Map(
        explores.flatMap((explore): [string, TableLocation][] => {
            if (isExploreError(explore)) return [];
            const table = explore.tables[explore.baseTable];
            return table
                ? [
                      [
                          explore.baseTable,
                          {
                              database: table.database,
                              schema: table.schema,
                              sqlTable: table.sqlTable,
                          },
                      ],
                  ]
                : [];
        }),
    );

/**
 * A manifest parsed without the warehouse's real target names its tables after
 * placeholders; this points every model the live project has at its live table,
 * and names the models it has no table for.
 */
export const pointManifestAtLiveTables = (
    manifest: DbtManifest,
    live: Map<string, TableLocation>,
): { manifest: DbtManifest; newModels: Set<string> } => {
    const newModels = new Set<string>();
    const nodes = Object.fromEntries(
        Object.entries(manifest.nodes).map(([id, node]) => {
            if (!isModelNode(node)) return [id, node];
            const location = live.get(node.name);
            if (!location) {
                newModels.add(node.name);
                return [id, node];
            }
            return [
                id,
                {
                    ...node,
                    database: location.database,
                    schema: location.schema,
                    relation_name: location.sqlTable,
                },
            ];
        }),
    );
    return { manifest: { ...manifest, nodes }, newModels };
};

/** A model with no working live explore has no known table; it can be tried once the preview is built. */
export const markNewModels = (
    explores: (Explore | ExploreError)[],
    newModels: Set<string>,
): (Explore | ExploreError)[] =>
    explores.map((explore) =>
        !isExploreError(explore) && newModels.has(explore.baseTable)
            ? {
                  name: explore.name,
                  label: explore.label,
                  groupLabel: explore.groupLabel,
                  groups: explore.groups,
                  errors: [
                      {
                          type: InlineErrorType.METADATA_PARSE_ERROR,
                          message:
                              'There is no live table for this model to read yet. Open the preview project to try it.',
                      },
                  ],
              }
            : explore,
    );

/** The models whose SQL or YAML is among the changed files, which are relative to the dbt project. */
// ponytail: a YAML file shared by several models marks them all, per-model YAML diffing if that over-reports
export const findChangedModels = (
    manifest: DbtManifest,
    changedFiles: string[],
): string[] => {
    const changed = new Set(changedFiles);
    const project = manifest.metadata.project_name;
    return Object.values(manifest.nodes)
        .filter(isModelNode)
        .filter(
            (node) =>
                ((project === undefined || node.package_name === project) &&
                    node.original_file_path !== undefined &&
                    changed.has(node.original_file_path)) ||
                (node.patch_path != null &&
                    changed.has(node.patch_path.replace(/^[^:]*:\/\//, ''))),
        )
        .map((node) => node.name)
        .sort();
};

/** What is stored for a person's latest dbt change: the pull request it went to, and what it compiles to. */
export type DbtTryOut = {
    prUrl: string | null;
    explores: (Explore | ExploreError)[];
};

/** One try-out per conversation, so each workspace keeps its own; null is where one was kept before workspaces. */
export const dbtTryOutFileId = (
    projectUuid: string,
    userUuid: string,
    threadUuid: string | null,
) =>
    `semantic-studio-dbt-try-out/${projectUuid}/${userUuid}${threadUuid ? `/${threadUuid}` : ''}`;
