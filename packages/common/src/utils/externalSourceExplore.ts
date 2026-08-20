import { ExploreCompiler } from '../compiler/exploreCompiler';
import { ExploreType, type Explore, type Table } from '../types/explore';
import { type ExternalSourceRef } from '../types/externalSources';
import {
    DimensionType,
    FieldType,
    friendlyName,
    MetricType,
    type Metric,
} from '../types/field';
import { type ResultColumns } from '../types/results';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import { type VizColumn } from '../visualizations/types';
import { buildDimensionsFromColumns } from './virtualView';

export const EXTERNAL_SOURCE_ROW_COUNT_METRIC = 'total_rows';

/**
 * Row count plus sum/avg per numeric column, so external source tables are
 * chartable and mergeable without any modeling. Metric SQL references the
 * dimension by name so quoting is inherited from the dimension.
 */
const buildAutoMetrics = (args: {
    tableName: string;
    tableLabel: string;
    columns: VizColumn[];
}): Record<string, Metric> => {
    const { tableName, tableLabel, columns } = args;
    const columnReferences = new Set(columns.map(({ reference }) => reference));
    const base = {
        table: tableName,
        tableLabel,
        fieldType: FieldType.METRIC as const,
        hidden: false,
    };

    const metrics: Record<string, Metric> = {};
    if (!columnReferences.has(EXTERNAL_SOURCE_ROW_COUNT_METRIC)) {
        metrics[EXTERNAL_SOURCE_ROW_COUNT_METRIC] = {
            ...base,
            name: EXTERNAL_SOURCE_ROW_COUNT_METRIC,
            label: 'Total rows',
            type: MetricType.COUNT,
            sql: '1',
            description: 'Number of rows in the source table.',
        };
    }

    columns
        .filter((column) => column.type === DimensionType.NUMBER)
        .forEach((column) => {
            const columnLabel = friendlyName(column.reference);
            const dimensionReference = `\${${column.reference}}`;
            const variants: Array<{
                suffix: string;
                type: MetricType;
                labelPrefix: string;
            }> = [
                { suffix: 'sum', type: MetricType.SUM, labelPrefix: 'Sum of' },
                {
                    suffix: 'avg',
                    type: MetricType.AVERAGE,
                    labelPrefix: 'Average',
                },
            ];
            variants.forEach(({ suffix, type, labelPrefix }) => {
                const name = `${column.reference}_${suffix}`;
                // A real column of the same name always wins
                if (columnReferences.has(name)) {
                    return;
                }
                metrics[name] = {
                    ...base,
                    name,
                    label: `${labelPrefix} ${columnLabel.toLowerCase()}`,
                    type,
                    sql: dimensionReference,
                    description: `${labelPrefix} ${columnLabel.toLowerCase()}, generated from the source table.`,
                    groups: [columnLabel],
                };
            });
        });

    return metrics;
};

/**
 * Build the explore for an external source table. The table's `sqlTable` is
 * the bare quoted table name: the execution layer late-binds it to the
 * ingested file with a `WITH <name> AS (SELECT * FROM read_parquet(...))`
 * CTE, so storage URIs never appear in compiled SQL.
 */
export const createExternalSourceExplore = (args: {
    name: string;
    label: string;
    columns: ResultColumns;
    externalSource: ExternalSourceRef;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): Explore => {
    const { name, label, columns, externalSource, warehouseSqlBuilder } = args;
    const vizColumns: VizColumn[] = Object.values(columns).map(
        ({ reference, type }) => ({ reference, type }),
    );
    const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

    const table: Table = {
        name,
        label,
        sqlTable: `${fieldQuoteChar}${name}${fieldQuoteChar}`,
        dimensions: buildDimensionsFromColumns({
            tableName: name,
            tableLabel: label,
            columns: vizColumns,
            warehouseSqlBuilder,
        }),
        metrics: buildAutoMetrics({
            tableName: name,
            tableLabel: label,
            columns: vizColumns,
        }),
        lineageGraph: { nodes: [], edges: [] },
        database: 'duckdb',
        schema: '',
    };

    const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
    const explore = exploreCompiler.compileExplore({
        name,
        label,
        tags: [],
        baseTable: name,
        joinedTables: [],
        tables: { [name]: table },
        targetDatabase: warehouseSqlBuilder.getAdapterType(),
        meta: {},
    });

    return {
        ...explore,
        type: ExploreType.EXTERNAL_SOURCE,
        externalSource,
    };
};
