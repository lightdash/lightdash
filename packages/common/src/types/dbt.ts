import { DepGraph } from 'dependency-graph';
import assertUnreachable from '../utils/assertUnreachable';
import { getItemId } from '../utils/item';
import {
    type ColumnInfo,
    type CompiledModelNode,
    type ParsedMetric,
} from './dbtFromSchema';
import { DbtError, ParseError } from './errors';
import {
    FieldType,
    friendlyName,
    type CompactOrAlias,
    type DimensionType,
    type FieldUrl,
    type Format,
    type Metric,
    type MetricType,
    type Source,
} from './field';
import { parseFilters } from './filterGrammar';
import { type OrderFieldsByStrategy } from './table';
import { type TimeFrames } from './timeFrames';

export enum SupportedDbtAdapter {
    BIGQUERY = 'bigquery',
    DATABRICKS = 'databricks',
    SNOWFLAKE = 'snowflake',
    REDSHIFT = 'redshift',
    POSTGRES = 'postgres',
    TRINO = 'trino',
}

export type DbtNodeConfig = {
    materialized: string;
    snowflake_warehouse: string;
};
export type DbtNode = {
    unique_id: string;
    resource_type: string;
    config?: DbtNodeConfig;
};
export type DbtRawModelNode = CompiledModelNode & {
    columns: { [name: string]: DbtModelColumn };
    config?: CompiledModelNode['config'] & { meta?: DbtModelMetadata };
    meta: DbtModelMetadata;
};
export type DbtModelNode = DbtRawModelNode & {
    database: string;
};
export type DbtModelColumn = ColumnInfo & {
    meta: DbtColumnMetadata;
    data_type?: DimensionType;
};

type DbtModelMetadata = DbtModelLightdashConfig & {};

type DbtModelLightdashConfig = {
    label?: string;
    joins?: DbtModelJoin[];
    metrics?: Record<string, DbtModelLightdashMetric>;
    order_fields_by?: OrderFieldsByStrategy;
    group_label?: string;
    sql_filter?: string;
    sql_where?: string; // alias for sql_filter
    required_filters?: { [key: string]: any }[];
    required_attributes?: Record<string, string | string[]>;
    group_details?: Record<string, DbtModelGroup>;
};

export type DbtModelGroup = {
    label: string;
    description?: string;
};

export type DbtModelJoinType = 'inner' | 'full' | 'left' | 'right';

type DbtModelJoin = {
    join: string;
    sql_on: string;
    alias?: string;
    label?: string;
    type?: DbtModelJoinType;
    hidden?: boolean;
    fields?: string[];
    always?: boolean;
};
type DbtColumnMetadata = DbtColumnLightdashConfig & {};
type DbtColumnLightdashConfig = {
    dimension?: DbtColumnLightdashDimension;
    additional_dimensions?: {
        [subDimensionName: string]: DbtColumnLightdashAdditionalDimension;
    };
    metrics?: { [metricName: string]: DbtColumnLightdashMetric };
};

type DbtColumnLightdashDimension = {
    name?: string;
    label?: string;
    type?: DimensionType;
    description?: string;
    sql?: string;
    time_intervals?: boolean | 'default' | 'OFF' | TimeFrames[];
    hidden?: boolean;
    round?: number;
    compact?: CompactOrAlias;
    format?: Format;
    group_label?: string;
    groups?: string[] | string;
    colors?: Record<string, string>;
    urls?: FieldUrl[];
    required_attributes?: Record<string, string | string[]>;
};

type DbtColumnLightdashAdditionalDimension = Omit<
    DbtColumnLightdashDimension,
    'name' | 'time_intervals'
>;

export type DbtColumnLightdashMetric = {
    label?: string;
    type: MetricType;
    description?: string;
    sql?: string;
    hidden?: boolean;
    round?: number;
    compact?: CompactOrAlias;
    format?: Format;
    group_label?: string;
    groups?: string[];
    urls?: FieldUrl[];
    show_underlying_values?: string[];
    filters?: { [key: string]: any }[];
    percentile?: number;
};

export type DbtModelLightdashMetric = DbtColumnLightdashMetric &
    Required<Pick<DbtColumnLightdashMetric, 'sql'>>;

export const normaliseModelDatabase = (
    model: DbtRawModelNode,
    targetWarehouse: SupportedDbtAdapter,
): DbtModelNode => {
    switch (targetWarehouse) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.REDSHIFT:
            if (model.database === null) {
                throw new ParseError(
                    `Cannot parse dbt model '${model.unique_id}' because the database field has null value.`,
                    {},
                );
            }
            return { ...model, database: model.database as string };
        case SupportedDbtAdapter.DATABRICKS:
            return { ...model, database: model.database || 'DEFAULT' };
        default:
            return assertUnreachable(
                targetWarehouse,
                `Cannot recognise warehouse ${targetWarehouse}`,
            );
    }
};
export const patchPathParts = (patchPath: string) => {
    const [project, ...rest] = patchPath.split('://');
    if (rest.length === 0) {
        throw new DbtError(
            'Could not parse dbt manifest. It looks like you might be using an old version of dbt. You must be using dbt version 0.20.0 or above.',
        );
    }
    return {
        project,
        path: rest.join('://'),
    };
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
        model.depends_on?.nodes?.forEach((nodeId) => {
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

export type V9MetricRef = {
    name: string;
    package?: string | null;
    version?: string | number | null;
};

export const isV9MetricRef = (x: string[] | V9MetricRef): x is V9MetricRef =>
    typeof x === 'object' && x !== null && 'name' in x;

export type DbtMetric = Omit<ParsedMetric, 'refs'> & {
    meta?: Record<string, any> & DbtMetricLightdashMetadata;
    refs?: string[][] | V9MetricRef[];
};

export type DbtMetricLightdashMetadata = {
    hidden?: boolean;
    group_label?: string;
    groups?: string[];
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

export const isSupportedDbtAdapterType = (
    x: string,
): x is SupportedDbtAdapter =>
    Object.values<string>(SupportedDbtAdapter).includes(x);

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

export const convertToGroups = (
    dbtGroups: string | string[] | undefined,
    dbtGroupLabel: string | undefined,
): string[] => {
    let groups: string[] = [];
    if (dbtGroups) {
        if (typeof dbtGroups === 'string') {
            groups = [dbtGroups];
        } else {
            groups = [...dbtGroups];
        }
    } else if (dbtGroupLabel) {
        groups = [dbtGroupLabel];
    }
    return groups;
};

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
type ConvertModelMetricArgs = {
    modelName: string;
    name: string;
    metric: DbtModelLightdashMetric;
    source?: Source;
    tableLabel: string;
    dimensionReference?: string;
    requiredAttributes?: Record<string, string | string[]>;
};
export const convertModelMetric = ({
    modelName,
    name,
    metric,
    source,
    tableLabel,
    dimensionReference,
    requiredAttributes,
}: ConvertModelMetricArgs): Metric => {
    const groups = convertToGroups(metric.groups, metric.group_label);
    return {
        fieldType: FieldType.METRIC,
        name,
        label: metric.label || friendlyName(name),
        sql: metric.sql,
        table: modelName,
        tableLabel,
        type: metric.type,
        isAutoGenerated: false,
        description: metric.description,
        source,
        hidden: !!metric.hidden,
        round: metric.round,
        compact: metric.compact,
        format: metric.format,
        groups,
        showUnderlyingValues: metric.show_underlying_values,
        filters: parseFilters(metric.filters),
        percentile: metric.percentile,
        dimensionReference,
        requiredAttributes,
        ...(metric.urls ? { urls: metric.urls } : {}),
    };
};
type ConvertColumnMetricArgs = Omit<ConvertModelMetricArgs, 'metric'> & {
    metric: DbtColumnLightdashMetric;
    dimensionName?: string;
    dimensionSql: string;
    requiredAttributes?: Record<string, string | string[]>;
};
export const convertColumnMetric = ({
    modelName,
    dimensionName,
    dimensionSql,
    name,
    metric,
    source,
    tableLabel,
    requiredAttributes,
}: ConvertColumnMetricArgs): Metric =>
    convertModelMetric({
        modelName,
        name,
        metric: {
            ...metric,
            sql: metric.sql || dimensionSql,
            description:
                metric.description ||
                (dimensionName
                    ? `${friendlyName(metric.type)} of ${friendlyName(
                          dimensionName,
                      )}`
                    : undefined),
        },
        source,
        tableLabel,
        dimensionReference: dimensionName
            ? getItemId({ table: modelName, name: dimensionName })
            : undefined,
        requiredAttributes,
    });

export enum DbtManifestVersion {
    V7 = 'v7',
    V8 = 'v8',
    V9 = 'v9',
    V10 = 'v10',
    V11 = 'v11',
    V12 = 'v12',
}

export enum DbtExposureType {
    DASHBOARD = 'dashboard',
    NOTEBOOK = 'notebook',
    ANALYSIS = 'analysis',
    ML = 'ml',
    APPLICATION = 'application',
}

export type DbtExposure = {
    name: string; // a unique exposure name written in snake case
    owner: {
        name: string;
        email: string;
    };
    type: DbtExposureType;
    dependsOn: string[]; // list of refs to models. eg: ref('fct_orders')
    label?: string;
    description?: string;
    url?: string;
    tags?: string[];
};
