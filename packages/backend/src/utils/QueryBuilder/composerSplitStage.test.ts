import { DuckDBInstance } from '@duckdb/node-api';
import {
    ChartType,
    composerChartVizConfigSchemaPersisted,
    FieldType,
    getComposerChartPivotStage,
    getComposerChartStage,
    QuerySourceType,
    type ComposerBuiltinChartVizConfig,
    type ComposerChartPipelineNode,
    type DuckdbSourceQuery,
    type SortField,
} from '@lightdash/common';
import { DuckdbSqlBuilder } from '@lightdash/warehouses';
import { PivotQueryBuilder } from './PivotQueryBuilder';

const runStage = async (
    stage: ComposerChartPipelineNode | DuckdbSourceQuery | null,
): Promise<Record<string, string | null>[]> => {
    if (
        stage?.sourceType !== QuerySourceType.DUCKDB ||
        !stage.pivotConfiguration
    ) {
        throw new Error('No pivot stage');
    }
    const sql = new PivotQueryBuilder(
        stage.sql,
        stage.pivotConfiguration,
        new DuckdbSqlBuilder(),
    ).toSql({ columnLimit: 100 });
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
        await connection.run(
            `CREATE TABLE node_result AS SELECT * FROM (VALUES
                ('2026-01', 'paid', 10),
                ('2026-02', 'paid', 20),
                ('2026-02', 'open', 5),
                ('2026-01', 'open', 7)
            ) t(month, status, revenue)`,
        );
        const reader = await connection.runAndReadAll(sql);
        return reader
            .getRowObjects()
            .map((row) =>
                Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                        key,
                        value === null ? null : String(value),
                    ]),
                ),
            );
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
};

const aiStage = (
    config: Partial<ComposerBuiltinChartVizConfig>,
    sorts: SortField[] = [],
) =>
    getComposerChartStage({
        vizConfig: composerChartVizConfigSchemaPersisted.parse({
            type: 'scatter',
            x: null,
            y: null,
            groupBy: null,
            stack: null,
            horizontal: null,
            y2: null,
            labels: null,
            ...config,
        }),
        customChartTypeSlots: [],
        sorts: {
            sorts,
            sortedMeasures: sorts.map(({ fieldId }) => fieldId),
        },
        nodeId: 'chart_stage',
        source: 'orders',
    });

const tileStage = (x: string, y: string) =>
    getComposerChartPivotStage(
        {
            schemaVersion: 1,
            terminalNodeId: 'orders',
            nodes: [
                {
                    nodeId: 'orders',
                    title: 'Orders',
                    sourceType: QuerySourceType.SQL,
                    sql: 'select 1',
                },
            ],
        },
        {
            schemaVersion: 1,
            columns: [
                { reference: 'month', fieldType: FieldType.DIMENSION },
                { reference: 'status', fieldType: FieldType.DIMENSION },
                { reference: 'revenue', fieldType: FieldType.METRIC },
            ],
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: { xField: x, yField: [y] },
                    eChartsConfig: { series: [] },
                },
            },
            pivotConfig: { columns: ['status'] },
            tableConfig: { columnOrder: [] },
        },
    );

// One point per (x, series), as "x|status|revenue".
const points = (rows: Record<string, string | null>[], x: string) =>
    rows.map((row) => `${row[x]}|${row.status}|${row.revenue_any}`).sort();

describe('composer series-split stage on DuckDB', () => {
    const revenuePoints = ['10|paid|10', '20|paid|20', '5|open|5', '7|open|7'];
    const monthPoints = [
        '2026-01|open|7',
        '2026-01|paid|10',
        '2026-02|open|5',
        '2026-02|paid|20',
    ];

    test('x that is also a y keeps one point per x value (AI answer)', async () => {
        const rows = await runStage(
            aiStage({ x: 'revenue', y: ['revenue'], groupBy: ['status'] }),
        );
        expect(points(rows, 'revenue')).toEqual(revenuePoints);
    });

    test('x that is also a y keeps one point per x value (saved tile)', async () => {
        const rows = await runStage(tileStage('revenue', 'revenue'));
        expect(points(rows, 'revenue')).toEqual(revenuePoints);
    });

    test('x that is not a y groups by x and the split', async () => {
        const ai = await runStage(
            aiStage({ x: 'month', y: ['revenue'], groupBy: ['status'] }),
        );
        const tile = await runStage(tileStage('month', 'revenue'));
        expect(points(ai, 'month')).toEqual(monthPoints);
        expect(points(tile, 'month')).toEqual(monthPoints);
    });

    test('x that is also a sorted y gives each x value its own row', async () => {
        const rows = await runStage(
            aiStage(
                {
                    type: 'bar',
                    stack: true,
                    x: 'revenue',
                    y: ['revenue'],
                    groupBy: ['status'],
                },
                [{ fieldId: 'revenue', descending: true }],
            ),
        );
        const rowIndexByX = Object.fromEntries(
            rows.map((row) => [row.revenue, row.row_index]),
        );
        expect(new Set(Object.values(rowIndexByX)).size).toBe(4);
    });
});
