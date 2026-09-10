import {
    buildDimensionsFromColumns,
    DimensionType,
    ExploreCompiler,
    FieldType,
    friendlyName,
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
    return (['query_events', 'ai_usage'] as const).map((name) => {
        const columns = compactedStreamSchemas[name];
        const label = friendlyName(name);
        const base = {
            table: name,
            tableLabel: label,
            fieldType: FieldType.METRIC as const,
            hidden: false,
        };
        const metrics: Record<string, Metric> = Object.fromEntries(
            systemStreamMetrics[name as keyof typeof systemStreamMetrics].map(
                ({ column, ...definition }) => [
                    definition.name,
                    {
                        ...base,
                        ...definition,
                        label: friendlyName(definition.name),
                        sql: `\${${column}}`,
                    },
                ],
            ),
        );
        return compiler.compileExplore({
            name,
            label,
            tags: [],
            baseTable: name,
            joinedTables: [],
            meta: {},
            targetDatabase: sqlBuilder.getAdapterType(),
            tables: {
                [name]: {
                    name,
                    label,
                    sqlTable: `"${name}"`,
                    database: 'memory',
                    schema: 'main',
                    lineageGraph: { nodes: [], edges: [] },
                    dimensions: buildDimensionsFromColumns({
                        tableName: name,
                        tableLabel: label,
                        columns: columns.map(({ name: reference, type }) => ({
                            reference,
                            type: dimensionTypes[type],
                        })),
                        warehouseSqlBuilder: sqlBuilder,
                    }),
                    metrics,
                },
            },
        });
    });
};
