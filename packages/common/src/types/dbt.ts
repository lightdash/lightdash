import { DepGraph } from 'dependency-graph';
import { DbtError, ParseError } from './errors';
import { DimensionType, MetricType } from './field';

export enum SupportedDbtAdapter {
    BIGQUERY = 'bigquery',
    DATABRICKS = 'databricks',
    SNOWFLAKE = 'snowflake',
    REDSHIFT = 'redshift',
    POSTGRES = 'postgres',
}

export type DbtNode = {
    unique_id: string;
    resource_type: string;
};
export type DbtRawModelNode = DbtNode & {
    columns: { [name: string]: DbtModelColumn };
    config?: { meta?: DbtModelMetadata };
    meta: DbtModelMetadata;
    database: string | null;
    schema: string;
    name: string;
    tags: string[];
    relation_name: string;
    depends_on: DbtTableDependency;
    description?: string;
    root_path: string;
    patch_path: string | null;
    original_file_path: string;
};
export type DbtModelNode = DbtRawModelNode & {
    database: string;
};
type DbtTableDependency = {
    nodes: string[];
};
export type DbtModelColumn = {
    name: string;
    description?: string;
    meta: DbtColumnMetadata;
    data_type?: DimensionType;
};

type DbtModelMetadata = DbtModelLightdashConfig & {};

type DbtModelLightdashConfig = {
    label?: string;
    joins?: DbtModelJoin[];
};
type DbtModelJoin = {
    join: string;
    sql_on: string;
};
type DbtColumnMetadata = DbtColumnLightdashConfig & {};
type DbtColumnLightdashConfig = {
    dimension?: DbtColumnLightdashDimension;
    metrics?: { [metricName: string]: DbtColumnLightdashMetric };
};

type DbtColumnLightdashDimension = {
    name?: string;
    label?: string;
    type?: DimensionType;
    description?: string;
    sql?: string;
    time_intervals?: string | string[];
    hidden?: boolean;
    round?: number;
    format?: string;
};

export type DbtColumnLightdashMetric = {
    label?: string;
    type: MetricType;
    description?: string;
    sql?: string;
    hidden?: boolean;
    round?: number;
    format?: string;
};
export const normaliseModelDatabase = (
    model: DbtRawModelNode,
    targetWarehouse: SupportedDbtAdapter,
): DbtModelNode => {
    switch (targetWarehouse) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
            if (model.database === null) {
                throw new ParseError(
                    `Cannot parse dbt model '${model.unique_id}' because the database field has null value.`,
                    {},
                );
            }
            return { ...model, database: model.database };
        case SupportedDbtAdapter.DATABRICKS:
            return { ...model, database: 'SPARK' };
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = targetWarehouse;
            throw new ParseError(
                `Cannot recognise warehouse ${targetWarehouse}`,
                {},
            );
    }
};
export const patchPathParts = (patchPath: string) => {
    const [project, ...rest] = patchPath.split('://');
    if (rest.length === 0) {
        throw new DbtError(
            'Could not parse dbt manifest. It looks like you might be using an old version of dbt. You must be using dbt version 0.20.0 or above.',
            {},
        );
    }
    return {
        project,
        path: rest.join('://'),
    };
};

export type DbtSchemaDotYaml = {
    version: 2;
    models: {
        name: string;
        description?: string;
        columns?: {
            name: string;
            description?: string;
        }[];
    }[];
};
export type LineageGraph = Record<string, LineageNodeDependency[]>;
export type LineageNodeDependency = {
    type: 'model' | 'seed' | 'source';
    name: string;
};
export const buildModelGraph = (
    allModels: Pick<DbtModelNode, 'unique_id' | 'name' | 'depends_on'>[],
): DepGraph<LineageNodeDependency> => {
    const depGraph = new DepGraph<LineageNodeDependency>();
    const lookup = Object.fromEntries(
        allModels.map((model) => [model.unique_id, model]),
    );
    allModels.forEach((model) => {
        depGraph.addNode(model.unique_id, { type: 'model', name: model.name });
        // Only use models for graph.
        model.depends_on.nodes.forEach((nodeId) => {
            const node = lookup[nodeId];
            if (node) {
                depGraph.addNode(node.unique_id, {
                    type: 'model',
                    name: node.name,
                });
                depGraph.addDependency(model.unique_id, node.unique_id);
            }
        });
    });
    return depGraph;
};
