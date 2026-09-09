import { DimensionType, Format } from '../types/field';
import { CartesianSeriesType, ChartKind } from '../types/savedCharts';
import { CartesianChartDataModel } from './CartesianChartDataModel';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

describe('CartesianChartDataModel formatters', () => {
    test('formats SI tooltip values dynamically', () => {
        const formatter = CartesianChartDataModel.getTooltipFormatter(
            Format.SI,
        );

        expect(formatter?.(999)).toEqual('999');
        expect(formatter?.(1200)).toEqual('1.2K');
        expect(formatter?.(1200000)).toEqual('1.2M');
    });

    test('formats SI value labels dynamically', () => {
        const formatter = CartesianChartDataModel.getValueFormatter(Format.SI);

        expect(
            formatter?.({
                dimensionNames: ['category', 'value'],
                encode: { y: [1] },
                value: { category: 'Jan', value: 1200000 },
            }),
        ).toEqual('1.2M');
    });
});

describe('CartesianChartDataModel series draw order', () => {
    const columns = ['target', 'sales'];

    const getModel = async (references = columns) => {
        const pivotChartData: PivotChartData = {
            queryUuid: undefined,
            fileUrl: undefined,
            results: [{ month: 'Jan', target: 40, sales: 100 }],
            indexColumn: { reference: 'month', type: VizIndexType.CATEGORY },
            valuesColumns: references.map((reference) => ({
                referenceField: reference.split('__')[0],
                pivotColumnName: reference,
                aggregation: VizAggregationOptions.SUM,
                pivotValues: [],
            })),
            columns: [],
            columnCount: references.length + 1,
        };
        const model = new CartesianChartDataModel({
            type: ChartKind.VERTICAL_BAR,
            resultsRunner: {
                getPivotedVisualizationData: async () => pivotChartData,
                getColumnNames: () => ['month', ...references],
                getRows: () => [],
                getPivotQueryDimensions: () => [],
                getPivotQueryMetrics: () => [],
                getPivotQueryCustomMetrics: () => [],
            },
            fieldConfig: {
                x: { reference: 'month', type: VizIndexType.CATEGORY },
                y: columns.map((reference) => ({
                    reference,
                    aggregation: VizAggregationOptions.SUM,
                })),
                groupBy: undefined,
            },
        });
        await model.getPivotedChartData({
            sql: 'SELECT 1',
            limit: 500,
            sortBy: [],
            filters: [],
        });
        return model;
    };

    test('brings a line in front of bars without changing its color or settings', async () => {
        const model = await getModel();
        const display = {
            series: {
                target: {
                    type: CartesianSeriesType.LINE as const,
                    label: 'Target',
                    whichYAxis: 1,
                    format: Format.PERCENT,
                },
                sales: { type: CartesianSeriesType.BAR as const },
            },
        };
        const before = model.getSpec(display);
        const after = model.getSpec({
            ...display,
            seriesOrder: ['sales', 'target'],
        });

        expect(before.series[0].z).toBeLessThan(before.series[1].z);
        expect(after.series.map((s: { name: string }) => s.name)).toEqual([
            'Sales',
            'Target',
        ]);
        expect(after.series[1]).toMatchObject({
            type: 'line',
            yAxisIndex: 1,
            color: before.series[0].color,
        });
        expect(after.series[0].color).toEqual(before.series[1].color);
        expect(after.series[1].z).toBeGreaterThan(after.series[0].z);
        expect(after.series[1].tooltip.valueFormatter(0.5)).toBe('50%');
    });

    test('orders pivot series independently, ignoring removed series and retaining new ones', async () => {
        const model = await getModel([
            'target__west',
            'sales__west',
            'target__east',
            'sales__east',
            'profit',
        ]);
        const spec = model.getSpec({
            seriesOrder: [
                'removed',
                'sales__west',
                'sales__east',
                'target__east',
                'target__west',
            ],
        });
        expect(
            spec.series.map((s: { encode: { y: string } }) => s.encode.y),
        ).toEqual([
            'sales__west',
            'sales__east',
            'target__east',
            'target__west',
            'profit',
        ]);
    });

    test('keeps the query series order when no order is saved', async () => {
        const model = await getModel();
        expect(
            model
                .getSpec()
                .series.map((s: { encode: { y: string } }) => s.encode.y),
        ).toEqual(columns);
    });
});

describe('CartesianChartDataModel getSpec', () => {
    const pivotChartData: PivotChartData = {
        queryUuid: undefined,
        fileUrl: undefined,
        results: [
            { month: '2026-04-01T00:00:00.000Z', month_count: '1' },
            { month: '2026-05-01T00:00:00.000Z', month_count: '2' },
        ],
        indexColumn: { reference: 'month', type: VizIndexType.TIME },
        valuesColumns: [
            {
                referenceField: 'month_count',
                pivotColumnName: 'month_count',
                aggregation: VizAggregationOptions.COUNT,
                pivotValues: [],
            },
        ],
        columns: [
            { reference: 'month', type: DimensionType.TIMESTAMP },
            { reference: 'month_count', type: DimensionType.NUMBER },
        ],
        columnCount: 2,
    };

    const resultsRunner: IResultsRunner = {
        getPivotedVisualizationData: async () => pivotChartData,
        getColumnNames: () => ['month', 'month_count'],
        getRows: () => [],
        getPivotQueryDimensions: () => [
            {
                reference: 'month',
                axisType: VizIndexType.TIME,
                dimensionType: DimensionType.TIMESTAMP,
            },
        ],
        getPivotQueryMetrics: () => [],
        getPivotQueryCustomMetrics: () => [],
    };

    test('renders time axis in UTC so tick placement matches the UTC label formatter', async () => {
        const model = new CartesianChartDataModel({
            resultsRunner,
            fieldConfig: {
                x: { reference: 'month', type: VizIndexType.TIME },
                y: [
                    {
                        reference: 'month_count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupBy: undefined,
            },
        });

        await model.getPivotedChartData({
            sql: 'SELECT 1',
            limit: 500,
            sortBy: [],
            filters: [],
        });
        const spec = model.getSpec();

        expect(spec.useUTC).toBe(true);
        expect(spec.xAxis.type).toBe(VizIndexType.TIME);
    });
});
