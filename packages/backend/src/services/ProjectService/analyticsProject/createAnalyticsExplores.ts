import {
    buildDimensionsFromColumns,
    DimensionType,
    ExploreCompiler,
    FieldType,
    friendlyName,
    JoinRelationship,
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
import { systemStreamMetrics } from '../../../analytics/systemExplores/systemStreamMetrics';

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
        'query_events',
        'ai_usage',
        'data_app_events',
        'export_events',
    ] as const;

    const buildTable = (name: (typeof streams)[number]) => {
        const label = friendlyName(name);
        const base = {
            table: name,
            tableLabel: label,
            fieldType: FieldType.METRIC as const,
            hidden: false,
        };
        const metrics: Record<string, Metric> = Object.fromEntries(
            systemStreamMetrics[name].map(({ column, ...definition }) => [
                definition.name,
                {
                    ...base,
                    ...definition,
                    label: friendlyName(definition.name),
                    sql: `\${${column}}`,
                },
            ]),
        );

        return {
            name,
            label,
            sqlTable: `"${name}"`,
            database: 'memory',
            schema: 'main',
            lineageGraph: { nodes: [], edges: [] },
            dimensions: buildDimensionsFromColumns({
                qualifyColumnReferences: true,
                tableName: name,
                tableLabel: label,
                columns: compactedStreamSchemas[name].map(
                    ({ name: reference, type }) => ({
                        reference,
                        type: dimensionTypes[type],
                    }),
                ),
                warehouseSqlBuilder: sqlBuilder,
            }),
            metrics,
        };
    };

    return streams.map((name) => {
        const dimensions: UsageDimensionName[] =
            name === 'query_events'
                ? ['charts', 'dashboards', 'users']
                : ['users'];
        if (name === 'ai_usage') dimensions.push('agents');
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
                ...dimensions.map((dimension) => {
                    const table = usageDimensionTable(dimension);
                    const id = dimensionFields[dimension].key;
                    return {
                        table,
                        type: 'left' as const,
                        relationship: JoinRelationship.MANY_TO_ONE,
                        sqlOn: `\${${name}.org_id} = \${${table}.org_id} AND \${${name}.${id}} = \${${table}.${id}}`,
                    };
                }),
                ...(includeQueryMetadata
                    ? [
                          {
                              table: 'query_events',
                              sqlOn: '${export_events.query_id} = ${query_events.query_id}',
                              relationship: JoinRelationship.MANY_TO_ONE,
                              fields: [
                                  'chart_id',
                                  'dashboard_id',
                                  'explore_name',
                              ],
                          },
                      ]
                    : []),
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
