import { DepGraph } from 'dependency-graph';
import { DbtError, ParseError } from './errors';
import {
    DimensionType,
    FieldType,
    FieldUrl,
    friendlyName,
    Metric,
    MetricType,
    Source,
} from './field';
import { parseFilters } from './filterGrammar';
import { AdditionalMetric } from './metricQuery';
import { TableBase } from './table';
import { TimeFrames } from './timeFrames';

export enum SupportedDbtAdapter {
    BIGQUERY = 'bigquery',
    DATABRICKS = 'databricks',
    SNOWFLAKE = 'snowflake',
    REDSHIFT = 'redshift',
    POSTGRES = 'postgres',
}

export type DbtNodeConfig = {
    materialized: string;
};
export type DbtNode = {
    unique_id: string;
    resource_type: string;
    config?: DbtNodeConfig;
};
export type DbtRawModelNode = DbtNode & {
    compiled?: boolean;
    columns: { [name: string]: DbtModelColumn };
    config?: { meta?: DbtModelMetadata; materialized?: string };
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
    time_intervals?: 'default' | 'OFF' | TimeFrames[];
    hidden?: boolean;
    round?: number;
    format?: string;
    group_label?: string;
    urls?: FieldUrl[];
};

export type DbtColumnLightdashMetric = {
    label?: string;
    type: MetricType;
    description?: string;
    sql?: string;
    hidden?: boolean;
    round?: number;
    format?: string;
    group_label?: string;
    urls?: FieldUrl[];
    show_underlying_values?: string[];
    filters?: { [key: string]: any }[];
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

export interface DbtCatalogNode {
    metadata: DbtCatalogNodeMetadata;
    columns: {
        [k: string]: DbtCatalogNodeColumn;
    };
}

export interface DbtCatalogNodeMetadata {
    type: string;
    database: string | null;
    schema: string;
    name: string;
    comment?: string;
    owner?: string;
}

export interface DbtCatalogNodeColumn {
    type: string;
    comment?: string;
    index: number;
    name: string;
}

export interface DbtRpcDocsGenerateResults {
    nodes: {
        [k: string]: DbtCatalogNode;
    };
}

export const isDbtRpcDocsGenerateResults = (
    results: Record<string, any>,
): results is DbtRpcDocsGenerateResults =>
    'nodes' in results &&
    typeof results.nodes === 'object' &&
    results.nodes !== null &&
    Object.values(results.nodes).every(
        (node) =>
            typeof node === 'object' &&
            node !== null &&
            'metadata' in node &&
            'columns' in node,
    );

export interface DbtPackage {
    package: string;
    version: string;
}

export interface DbtPackages {
    packages: DbtPackage[];
}

export const isDbtPackages = (
    results: Record<string, any>,
): results is DbtPackages => 'packages' in results;
type DbtMetricFilter = {
    field: string;
    operator: string;
    value: string;
};
export type DbtMetric = {
    fqn: string[];
    unique_id: string;
    package_name: string;
    path: string;
    root_path: string;
    original_file_path: string;
    name: string;
    description: string;
    label: string;
    type: string;
    sql: string;
    timestamp?: string | null;
    filters: DbtMetricFilter[];
    time_grains: string[];
    dimensions: string[];
    model?: string | null;
    model_unique_id?: string | null;
    resource_type?: 'metric';
    meta?: Record<string, any> & DbtMetricLightdashMetadata;
    tags?: string[];
    sources?: string[][];
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    refs?: string[][];
    metrics?: string[][];
    created_at?: number;
};

export type DbtMetricLightdashMetadata = {
    hidden?: boolean;
    group_label?: string;
    show_underlying_values?: string[];
    filters: Record<string, any>[];
};

export type DbtDoc = {
    unique_id: string;
    name: string;
    block_contents: string;
};

export interface DbtManifest {
    nodes: Record<string, DbtNode>;
    metadata: DbtRawManifestMetadata;
    metrics: Record<string, DbtMetric>;
    docs: Record<string, DbtDoc>;
}

export interface DbtRawManifestMetadata {
    dbt_schema_version: string;
    generated_at: string;
    adapter_type: string;
}

export interface DbtManifestMetadata extends DbtRawManifestMetadata {
    adapter_type: SupportedDbtAdapter;
}

const isDbtRawManifestMetadata = (x: any): x is DbtRawManifestMetadata =>
    typeof x === 'object' &&
    x !== null &&
    'dbt_schema_version' in x &&
    'generated_at' in x &&
    'adapter_type' in x;
export const isSupportedDbtAdapter = (
    x: DbtRawManifestMetadata,
): x is DbtManifestMetadata =>
    isDbtRawManifestMetadata(x) &&
    Object.values<string>(SupportedDbtAdapter).includes(x.adapter_type);

export interface DbtRpcGetManifestResults {
    manifest: DbtManifest;
}

export const isDbtRpcManifestResults = (
    results: Record<string, any>,
): results is DbtRpcGetManifestResults =>
    'manifest' in results &&
    typeof results.manifest === 'object' &&
    results.manifest !== null &&
    'nodes' in results.manifest &&
    'metadata' in results.manifest &&
    'metrics' in results.manifest &&
    isDbtRawManifestMetadata(results.manifest.metadata);

export interface DbtRpcCompileResults {
    results: { node: DbtNode }[];
}

export const isDbtRpcCompileResults = (
    results: Record<string, any>,
): results is DbtRpcCompileResults =>
    'results' in results &&
    Array.isArray(results.results) &&
    results.results.every(
        (result) =>
            typeof result === 'object' &&
            result !== null &&
            'node' in result &&
            typeof result.node === 'object' &&
            result.node !== null &&
            'unique_id' in result.node &&
            'resource_type' in result.node,
    );

export interface DbtRpcRunSqlResults {
    results: {
        table: { column_names: string[]; rows: any[][] };
    }[];
}

export const isDbtRpcRunSqlResults = (
    results: Record<string, any>,
): results is DbtRpcRunSqlResults =>
    'results' in results &&
    Array.isArray(results.results) &&
    results.results.every(
        (result) =>
            typeof result === 'object' &&
            result !== null &&
            'table' in result &&
            typeof result.table === 'object' &&
            result.table !== null &&
            'column_names' in result.table &&
            Array.isArray(result.table.column_names) &&
            'rows' in result.table &&
            Array.isArray(result.table.rows),
    );
type ConvertMetricArgs = {
    modelName: string;
    dimensionName?: string;
    dimensionSql: string;
    name: string;
    metric: DbtColumnLightdashMetric;
    source?: Source;
    tableLabel: string;
};
export const convertMetric = ({
    modelName,
    dimensionName,
    dimensionSql,
    name,
    metric,
    source,
    tableLabel,
}: ConvertMetricArgs): Metric => ({
        fieldType: FieldType.METRIC,
        name,
        label: metric.label || friendlyName(name),
        sql: metric.sql || dimensionSql,
        table: modelName,
        tableLabel,
        type: metric.type,
        isAutoGenerated: false,
        description:
            metric.description ||
            (dimensionName
                ? `${friendlyName(metric.type)} of ${friendlyName(
                      dimensionName,
                  )}`
                : undefined),
        source,
        hidden: !!metric.hidden,
        round: metric.round,
        format: metric.format,
        groupLabel: metric.group_label,
        showUnderlyingValues: metric.show_underlying_values,
        filters: parseFilters(metric.filters),
        ...(metric.urls ? { urls: metric.urls } : {}),
    });
type ConvertAdditionalMetricArgs = {
    additionalMetric: AdditionalMetric;
    table: TableBase;
};
export const convertAdditionalMetric = ({
    additionalMetric,
    table,
}: ConvertAdditionalMetricArgs): Metric =>
    convertMetric({
        modelName: table.name,
        dimensionSql: additionalMetric.sql,
        name: additionalMetric.name,
        metric: additionalMetric,
        tableLabel: table.label,
    });
