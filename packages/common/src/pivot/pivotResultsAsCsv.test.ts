import type { ItemsMap } from '../types/field';
import { pivotResultsAsCsv, pivotResultsAsData } from './pivotQueryResults';
import {
    getFieldMock,
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from './pivotQueryResults.mock';

const buildItemsMap = (): ItemsMap => {
    const fieldIds = [
        ...METRIC_QUERY_2DIM_2METRIC.dimensions,
        ...METRIC_QUERY_2DIM_2METRIC.metrics,
    ];
    const map: ItemsMap = {};
    fieldIds.forEach((id) => {
        const field = getFieldMock(id);
        if (field) map[id] = field;
    });
    return map;
};

describe('pivotResultsAsCsv', () => {
    it('returns string[][] with headers and formatted data rows', () => {
        const result = pivotResultsAsCsv({
            pivotConfig: {
                pivotDimensions: ['page'],
                metricsAsRows: false,
            },
            rows: RESULT_ROWS_2DIM_2METRIC,
            itemMap: buildItemsMap(),
            metricQuery: {
                exploreName: 'test',
                ...METRIC_QUERY_2DIM_2METRIC,
                filters: {},
                sorts: [],
                limit: 500,
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            },
            customLabels: undefined,
            onlyRaw: false,
            maxColumnLimit: 60,
            pivotDetails: null,
        });

        // Result should be a 2D string array
        expect(Array.isArray(result)).toBe(true);
        result.forEach((row) => {
            expect(Array.isArray(row)).toBe(true);
            row.forEach((cell) => {
                expect(typeof cell).toBe('string');
            });
        });

        // Should have at least 1 header row + data rows
        expect(result.length).toBeGreaterThan(1);
    });

    it('applies customLabels to headers', () => {
        const result = pivotResultsAsCsv({
            pivotConfig: {
                pivotDimensions: ['page'],
                metricsAsRows: false,
            },
            rows: RESULT_ROWS_2DIM_2METRIC,
            itemMap: buildItemsMap(),
            metricQuery: {
                exploreName: 'test',
                ...METRIC_QUERY_2DIM_2METRIC,
                filters: {},
                sorts: [],
                limit: 500,
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            },
            customLabels: { views: 'Page Views' },
            onlyRaw: false,
            maxColumnLimit: 60,
            pivotDetails: null,
        });

        const allValues = result.flat();
        expect(allValues).toContain('Page Views');
    });

    it('produces same number of columns as pivotResultsAsData', () => {
        const params = {
            pivotConfig: {
                pivotDimensions: ['page'],
                metricsAsRows: false,
            },
            rows: RESULT_ROWS_2DIM_2METRIC,
            itemMap: buildItemsMap(),
            metricQuery: {
                exploreName: 'test',
                ...METRIC_QUERY_2DIM_2METRIC,
                filters: {},
                sorts: [],
                limit: 500,
                customDimensions: [],
                metricOverrides: {},
                dimensionOverrides: {},
            },
            customLabels: undefined,
            onlyRaw: false,
            maxColumnLimit: 60,
            pivotDetails: null,
        };

        const csvResult = pivotResultsAsCsv(params);
        const dataResult = pivotResultsAsData(params);

        // Data rows in CSV should match dataRows from pivotResultsAsData
        const csvDataRows = csvResult.slice(dataResult.headers.length);
        expect(csvDataRows.length).toBe(dataResult.dataRows.length);

        // Each CSV data row should have same length as corresponding data row
        csvDataRows.forEach((csvRow, i) => {
            expect(csvRow.length).toBe(dataResult.dataRows[i].length);
        });
    });
});
