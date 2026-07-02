import {
    assertUnreachable,
    DimensionType,
    Explore,
    ExploreCompiler,
    ExploreType,
    FieldType,
    friendlyName,
    getDefaultTimeFrames,
    MetricType,
    SupportedDbtAdapter,
    timeFrameConfigs,
    type Dimension,
    type Metric,
    type Table,
    type WeekDay,
} from '@lightdash/common';
import type { Project } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import type { LightdashConfig } from '../../config/parseConfig';
import { compactedStreamSchemas } from '../eventStream/registry';
import type {
    CompactedColumnType,
    CompactedStreamColumn,
} from '../eventStream/types';
import { COMPACTED_KEY_PREFIX } from '../eventStream/UsageEventsCompactor';

export const SYSTEM_EXPLORE_GROUP = 'Usage analytics';

const SYSTEM_EXPLORE_NAME_PREFIX = 'lightdash_';

export const getSystemExploreName = (stream: string): string =>
    `${SYSTEM_EXPLORE_NAME_PREFIX}${stream}`;

export const isSystemExploreName = (exploreName: string): boolean =>
    Object.keys(compactedStreamSchemas).some(
        (stream) => getSystemExploreName(stream) === exploreName,
    );

type SystemMetricDef = Pick<Metric, 'name' | 'description' | 'percentile'> & {
    type: MetricType;
    column: string;
};

/**
 * Curated metrics per event stream. Streams without an entry still get an
 * explore with dimensions only.
 */
const systemStreamMetrics: Record<string, SystemMetricDef[]> = {
    query_events: [
        {
            name: 'total_events',
            description: 'Total number of query events',
            type: MetricType.COUNT,
            column: 'event_name',
        },
        {
            name: 'unique_users',
            description: 'Number of distinct users',
            type: MetricType.COUNT_DISTINCT,
            column: 'user_id',
        },
        {
            name: 'unique_queries',
            description: 'Number of distinct queries',
            type: MetricType.COUNT_DISTINCT,
            column: 'query_id',
        },
        {
            name: 'avg_warehouse_execution_time_ms',
            description: 'Average warehouse execution time in milliseconds',
            type: MetricType.AVERAGE,
            column: 'warehouse_execution_time_ms',
        },
        {
            name: 'p90_warehouse_execution_time_ms',
            description:
                '90th percentile warehouse execution time in milliseconds',
            type: MetricType.PERCENTILE,
            column: 'warehouse_execution_time_ms',
            percentile: 90,
        },
    ],
};

const dimensionTypeFromColumnType = (
    type: CompactedColumnType,
): DimensionType => {
    switch (type) {
        case 'VARCHAR':
            return DimensionType.STRING;
        case 'TIMESTAMP':
            return DimensionType.TIMESTAMP;
        case 'BOOLEAN':
            return DimensionType.BOOLEAN;
        case 'INTEGER':
        case 'BIGINT':
            return DimensionType.NUMBER;
        default:
            return assertUnreachable(
                type,
                `Unknown compacted column type: ${type}`,
            );
    }
};

const buildDimensions = (args: {
    tableName: string;
    tableLabel: string;
    columns: CompactedStreamColumn[];
    fieldQuoteChar: string;
    startOfWeek: WeekDay | null;
}): Record<string, Dimension> => {
    const { tableName, tableLabel, columns, fieldQuoteChar, startOfWeek } =
        args;
    return columns.reduce<Record<string, Dimension>>((acc, column) => {
        const type = dimensionTypeFromColumnType(column.type);
        const sql = `\${TABLE}.${fieldQuoteChar}${column.name}${fieldQuoteChar}`;
        const label = friendlyName(column.name);
        const base: Dimension = {
            fieldType: FieldType.DIMENSION,
            name: column.name,
            label,
            table: tableName,
            tableLabel,
            type,
            sql,
            hidden: false,
        };

        if (type !== DimensionType.TIMESTAMP) {
            acc[column.name] = base;
            return acc;
        }

        // Time dimension: base + one dimension per default granularity
        acc[column.name] = { ...base, isIntervalBase: true };
        getDefaultTimeFrames(type).forEach((interval) => {
            const config = timeFrameConfigs[interval];
            acc[`${column.name}_${interval.toLowerCase()}`] = {
                fieldType: FieldType.DIMENSION,
                name: `${column.name}_${interval.toLowerCase()}`,
                label: `${label} ${config.getLabel().toLowerCase()}`,
                table: tableName,
                tableLabel,
                type: config.getDimensionType(type),
                sql: config.getSql(
                    SupportedDbtAdapter.DUCKDB,
                    interval,
                    sql,
                    type,
                    startOfWeek,
                ),
                hidden: false,
                timeInterval: interval,
                timeIntervalBaseDimensionName: column.name,
                timeIntervalBaseDimensionType: type,
                groups: [label],
            };
        });
        return acc;
    }, {});
};

const buildMetrics = (args: {
    tableName: string;
    tableLabel: string;
    stream: string;
    fieldQuoteChar: string;
}): Record<string, Metric> => {
    const { tableName, tableLabel, stream, fieldQuoteChar } = args;
    const defs = systemStreamMetrics[stream] ?? [];
    return defs.reduce<Record<string, Metric>>((acc, def) => {
        acc[def.name] = {
            fieldType: FieldType.METRIC,
            name: def.name,
            label: friendlyName(def.name),
            description: def.description,
            table: tableName,
            tableLabel,
            type: def.type,
            sql: `\${TABLE}.${fieldQuoteChar}${def.column}${fieldQuoteChar}`,
            hidden: false,
            ...(def.percentile !== undefined
                ? { percentile: def.percentile }
                : {}),
        };
        return acc;
    }, {});
};

/**
 * DuckDB table expression over the compacted zone for one (org, stream)
 * pair. The org is pinned at generation time — explores are compiled per
 * project and a project belongs to exactly one organization. Partition
 * pruning on org/dt comes from hive_partitioning.
 */
const buildSqlTable = (args: {
    bucket: string;
    organizationUuid: string;
    stream: string;
}): string =>
    `read_parquet('s3://${args.bucket}/${COMPACTED_KEY_PREFIX}/org_id=${args.organizationUuid}/stream=${args.stream}/**/*.parquet', hive_partitioning=true, union_by_name=true)`;

/** URI prefix that system explore queries are allowed to read from. */
export const getSystemExploreAllowedUriPrefix = (bucket: string): string =>
    `s3://${bucket}/${COMPACTED_KEY_PREFIX}/`;

export type BuildSystemExploresArgs = {
    organizationUuid: string;
    bucket: string;
    startOfWeek: WeekDay | null;
};

/**
 * Code-generates one SYSTEM explore per registered event stream, reading
 * the compacted usage-events parquet zone through DuckDB.
 */
export const buildSystemExplores = (
    args: BuildSystemExploresArgs,
): Explore[] => {
    const { organizationUuid, bucket, startOfWeek } = args;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        SupportedDbtAdapter.DUCKDB,
        startOfWeek ?? undefined,
    );
    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
    const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

    return Object.entries(compactedStreamSchemas).map(([stream, columns]) => {
        const exploreName = getSystemExploreName(stream);
        const label = friendlyName(exploreName);
        const table: Table = {
            name: exploreName,
            label,
            description: `Lightdash usage analytics: ${friendlyName(stream)}`,
            database: 'duckdb',
            schema: '',
            sqlTable: buildSqlTable({ bucket, organizationUuid, stream }),
            dimensions: buildDimensions({
                tableName: exploreName,
                tableLabel: label,
                columns,
                fieldQuoteChar,
                startOfWeek,
            }),
            metrics: buildMetrics({
                tableName: exploreName,
                tableLabel: label,
                stream,
                fieldQuoteChar,
            }),
            lineageGraph: {},
        };

        const explore = exploreCompiler.compileExplore({
            name: exploreName,
            label,
            tags: [],
            baseTable: exploreName,
            joinedTables: [],
            tables: { [exploreName]: table },
            targetDatabase: SupportedDbtAdapter.DUCKDB,
            meta: {},
        });

        return {
            ...explore,
            type: ExploreType.SYSTEM,
            groups: [SYSTEM_EXPLORE_GROUP],
        };
    });
};

/**
 * System explores for a project, or none when gated off: multi-org
 * instances never expose them (the compacted zone is org-partitioned but
 * the instance-level toggle is not org-scoped), usage events must be
 * enabled with an S3 config, and the project toggle must be on.
 */
export const getSystemExploresForProject = (
    config: Pick<LightdashConfig, 'usageEvents' | 'allowMultiOrgs'>,
    project: Pick<
        Project,
        'organizationUuid' | 'systemExploresEnabled' | 'warehouseConnection'
    >,
): Explore[] => {
    if (!config.usageEvents.enabled || config.usageEvents.s3 === null) {
        return [];
    }
    if (config.allowMultiOrgs) {
        return [];
    }
    if (!project.systemExploresEnabled) {
        return [];
    }
    return buildSystemExplores({
        organizationUuid: project.organizationUuid,
        bucket: config.usageEvents.s3.bucket,
        startOfWeek: project.warehouseConnection?.startOfWeek ?? null,
    });
};
