import {
    buildDimensionsFromColumns,
    DimensionType,
    ExploreCompiler,
    FieldType,
    friendlyName,
    JoinRelationship,
    MetricType,
    WarehouseTypes,
    type Explore,
    type Metric,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compactedStreamSchemas } from '../../../analytics/eventStream/registry';
import type { CompactedColumnType } from '../../../analytics/eventStream/types';
import {
    usageDimensionSchemas,
    usageDimensionTable,
    type UsageDimensionName,
} from '../../../analytics/eventStream/usageDimensions';
import {
    analyticsStreams,
    userActivityColumns,
} from '../../../analytics/eventStream/userActivity';
import {
    systemStreamMetrics,
    userActivityMetrics,
} from '../../../analytics/systemExplores/systemStreamMetrics';
import {
    toolActivityColumns,
    toolActivityMetrics,
    toolActivitySql,
} from '../../../analytics/systemExplores/toolActivity';

const dimensionFields = {
    charts: { key: 'chart_id', label: 'Chart name' },
    dashboards: { key: 'dashboard_id', label: 'Dashboard name' },
    users: { key: 'user_id', label: 'User name' },
    agents: { key: 'agent_id', label: 'Agent name' },
};

const dimensionTypes: Record<CompactedColumnType, DimensionType> = {
    VARCHAR: DimensionType.STRING,
    TIMESTAMP: DimensionType.TIMESTAMP,
    BOOLEAN: DimensionType.BOOLEAN,
    INTEGER: DimensionType.NUMBER,
    BIGINT: DimensionType.NUMBER,
};

/** Compile backend-owned system models without querying remote storage. */
export const createAnalyticsExplores = (): Explore[] => {
    const sqlBuilder = warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB);
    const compiler = new ExploreCompiler(sqlBuilder);
    const streams = [
        ...analyticsStreams.filter((name) => name !== 'mcp_tool_calls'),
        'user_activity',
        'tool_activity',
    ] as const;

    const buildTable = (name: (typeof streams)[number]) => {
        const label = friendlyName(name);
        const base = {
            table: name,
            tableLabel: label,
            fieldType: FieldType.METRIC as const,
            hidden: false,
        };
        const model = {
            user_activity: {
                columns: userActivityColumns,
                metrics: userActivityMetrics,
            },
            tool_activity: {
                columns: toolActivityColumns,
                metrics: toolActivityMetrics,
            },
        };
        const modelDefinition =
            name === 'user_activity' || name === 'tool_activity'
                ? model[name]
                : {
                      columns: compactedStreamSchemas[name],
                      metrics: systemStreamMetrics[name],
                  };
        const metrics: Record<string, Metric> = Object.fromEntries(
            modelDefinition.metrics.map(({ column, ...definition }) => [
                definition.name,
                {
                    ...base,
                    ...definition,
                    label: friendlyName(definition.name),
                    sql: `\${${column}}`,
                },
            ]),
        );

        if (name === 'tool_activity') {
            metrics.error_rate = {
                ...base,
                name: 'error_rate',
                label: 'Error rate',
                description:
                    'Failed calls divided by calls with a known success/error outcome; unknown outcomes are excluded',
                type: MetricType.NUMBER,
                sql: "1.0 * SUM(CASE WHEN ${status} = 'error' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN ${status} IN ('success', 'error') THEN 1 ELSE 0 END), 0)",
            };
        }
        const table = {
            name,
            label,
            ...(name === 'query_events'
                ? { primaryKey: ['org_id', 'query_id'] }
                : {}),
            sqlTable: name === 'tool_activity' ? toolActivitySql : `"${name}"`,
            database: 'memory',
            schema: 'main',
            lineageGraph: { nodes: [], edges: [] },
            dimensions: buildDimensionsFromColumns({
                qualifyColumnReferences: true,
                tableName: name,
                tableLabel: label,
                columns: modelDefinition.columns.map(
                    ({ name: reference, type }) => ({
                        reference,
                        type: dimensionTypes[type],
                    }),
                ),
                warehouseSqlBuilder: sqlBuilder,
            }),
            metrics,
        };
        table.dimensions.user_id.label = 'User UUID';
        table.dimensions.project_id.label = 'Project UUID';
        if (name === 'user_activity') {
            table.dimensions.org_id.hidden = true;
            for (const column of userActivityColumns.filter(
                ({ type }) => type === 'BIGINT',
            )) {
                table.dimensions[column.name].hidden = true;
            }
        }
        return table;
    };

    return streams.map((name) => {
        const dimensions: UsageDimensionName[] =
            name === 'query_events' || name === 'export_events'
                ? ['charts', 'dashboards', 'users']
                : ['users'];
        if (
            name === 'ai_usage' ||
            name === 'agent_steps' ||
            name === 'tool_activity'
        )
            dimensions.push('agents');
        const dimensionTables = Object.fromEntries(
            dimensions.map((dimension) => {
                const tableName = usageDimensionTable(dimension);
                const tableLabel = friendlyName(dimension);
                const fields = buildDimensionsFromColumns({
                    qualifyColumnReferences: true,
                    tableName,
                    tableLabel,
                    columns: usageDimensionSchemas[dimension].map(
                        ({ name: reference, type }) => ({
                            reference,
                            type: dimensionTypes[type],
                        }),
                    ),
                    warehouseSqlBuilder: sqlBuilder,
                });
                fields.org_id.hidden = true;
                fields.name.label = dimensionFields[dimension].label;
                if (dimension === 'users')
                    fields.name.sql = "COALESCE(${TABLE}.name, 'Unknown user')";
                if (dimension === 'agents')
                    fields.name.sql =
                        "COALESCE(${TABLE}.name, 'Unknown agent')";
                return [
                    tableName,
                    {
                        name: tableName,
                        label: tableLabel,
                        primaryKey: ['org_id', dimensionFields[dimension].key],
                        sqlTable: `"${tableName}"`,
                        database: 'memory',
                        schema: 'main',
                        lineageGraph: { nodes: [], edges: [] },
                        dimensions: fields,
                        metrics: {},
                    },
                ];
            }),
        );
        const label = friendlyName(name);
        const includeQueryMetadata = name === 'export_events';
        return compiler.compileExplore({
            name,
            label,
            tags: [],
            baseTable: name,
            joinedTables: [
                ...(includeQueryMetadata
                    ? [
                          {
                              table: 'query_events',
                              type: 'left' as const,
                              sqlOn: '${export_events.org_id} = ${query_events.org_id} AND ${export_events.query_id} = ${query_events.query_id}',
                              relationship: JoinRelationship.MANY_TO_ONE,
                              fields: [
                                  'chart_id',
                                  'dashboard_id',
                                  'explore_name',
                              ],
                          },
                      ]
                    : []),
                ...dimensions.map((dimension) => {
                    const table = usageDimensionTable(dimension);
                    const id = dimensionFields[dimension].key;
                    const source =
                        includeQueryMetadata && dimension !== 'users'
                            ? 'query_events'
                            : name;
                    return {
                        table,
                        type: 'left' as const,
                        relationship: JoinRelationship.MANY_TO_ONE,
                        sqlOn: `\${${name}.org_id} = \${${table}.org_id} AND \${${source}.${id}} = \${${table}.${id}}`,
                    };
                }),
            ],
            meta: {},
            targetDatabase: sqlBuilder.getAdapterType(),
            tables: {
                ...dimensionTables,
                [name]: buildTable(name),
                ...(includeQueryMetadata
                    ? { query_events: buildTable('query_events') }
                    : {}),
            },
        });
    });
};
