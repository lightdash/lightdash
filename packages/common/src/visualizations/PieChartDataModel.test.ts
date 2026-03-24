import { DimensionType } from '../types/field';
import type { RawResultRow } from '../types/results';
import { PieChartDataModel } from './PieChartDataModel';
import { VizAggregationOptions, VizIndexType } from './types';
import type { IResultsRunner } from './types/IResultsRunner';

const createResultsRunner = (): IResultsRunner => ({
    getPivotedVisualizationData: jest.fn(),
    getColumnNames: jest.fn().mockReturnValue([]),
    getRows: jest.fn().mockReturnValue([]),
    getPivotQueryDimensions: jest.fn().mockReturnValue([
        {
            reference: 'category',
            axisType: VizIndexType.CATEGORY,
            dimensionType: DimensionType.STRING,
        },
    ]),
    getPivotQueryMetrics: jest.fn().mockReturnValue([
        {
            reference: 'value',
            aggregation: VizAggregationOptions.SUM,
        },
    ]),
    getPivotQueryCustomMetrics: jest.fn().mockReturnValue([]),
});

describe('PieChartDataModel', () => {
    it('returns columns from pivot metadata when results are empty', async () => {
        const resultsRunner = createResultsRunner();
        resultsRunner.getPivotedVisualizationData = jest
            .fn()
            .mockResolvedValue({
                queryUuid: 'query-1',
                fileUrl: 'file-url',
                results: [],
                indexColumn: {
                    reference: 'category',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        referenceField: 'value',
                        pivotColumnName: 'value_sum',
                        aggregation: VizAggregationOptions.SUM,
                        pivotValues: [],
                    },
                ],
                columns: [
                    { reference: 'category' },
                    { reference: 'value_sum' },
                ],
                columnCount: 2,
            });

        const model = new PieChartDataModel({
            resultsRunner,
            fieldConfig: {
                x: {
                    reference: 'category',
                    type: VizIndexType.CATEGORY,
                },
                y: [
                    {
                        reference: 'value',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [],
            },
        });

        await model.getPivotedChartData({
            sql: 'select 1',
            limit: 500,
            sortBy: [],
            filters: [],
        });

        expect(model.getPivotedTableData()).toEqual({
            columns: ['category', 'value_sum'],
            rows: [],
        });
    });

    it('falls back to the first object row when metadata columns are missing', async () => {
        const resultsRunner = createResultsRunner();
        resultsRunner.getPivotedVisualizationData = jest
            .fn()
            .mockResolvedValue({
                queryUuid: 'query-2',
                fileUrl: 'file-url',
                results: [
                    null as unknown as RawResultRow,
                    {
                        category: 'A',
                        value_sum: 10,
                    },
                ],
                indexColumn: {
                    reference: 'category',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        referenceField: 'value',
                        pivotColumnName: 'value_sum',
                        aggregation: VizAggregationOptions.SUM,
                        pivotValues: [],
                    },
                ],
                columns: [],
                columnCount: 2,
            });

        const model = new PieChartDataModel({
            resultsRunner,
            fieldConfig: {
                x: {
                    reference: 'category',
                    type: VizIndexType.CATEGORY,
                },
                y: [
                    {
                        reference: 'value',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [],
            },
        });

        await model.getPivotedChartData({
            sql: 'select 1',
            limit: 500,
            sortBy: [],
            filters: [],
        });

        expect(model.getPivotedTableData()).toEqual({
            columns: ['category', 'value_sum'],
            rows: [null, { category: 'A', value_sum: 10 }],
        });
    });
});
