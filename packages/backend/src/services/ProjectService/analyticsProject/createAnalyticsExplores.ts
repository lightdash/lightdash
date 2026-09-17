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
import { systemStreamMetrics } from '../../../analytics/systemExplores/systemStreamMetrics';

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
        const label = friendlyName(name);
        const includeQueryMetadata = name === 'export_events';
        return compiler.compileExplore({
            name,
            label,
            tags: [],
            baseTable: name,
            joinedTables: includeQueryMetadata
                ? [
                      {
                          table: 'query_events',
                          sqlOn: '${export_events.query_id} = ${query_events.query_id}',
                          relationship: JoinRelationship.MANY_TO_ONE,
                          fields: ['chart_id', 'dashboard_id', 'explore_name'],
                      },
                  ]
                : [],
            meta: {},
            targetDatabase: sqlBuilder.getAdapterType(),
            tables: {
                [name]: buildTable(name),
                ...(includeQueryMetadata
                    ? { query_events: buildTable('query_events') }
                    : {}),
            },
        });
    });
};
