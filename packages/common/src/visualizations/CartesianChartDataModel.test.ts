import { DimensionType, Format } from '../types/field';
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
