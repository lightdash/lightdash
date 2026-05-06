import type { ItemsMap } from '../types/field';
import type { ResultRow } from '../types/results';
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

    it('returns empty cells for rows missing an expected pivot field instead of throwing (#16866)', () => {
        // https://github.com/lightdash/lightdash/issues/16866
        // Repro: a CSV export with a pivoted chart whose result rows are
        // missing one of the value-column fields used to throw
        // `Cannot get key 'X' from object` deep inside the pivot pipeline,
        // crashing scheduled deliveries silently.
        // Expectation: pivotResultsAsCsv tolerates missing fields by
        // emitting empty/placeholder cells, so the export still succeeds.
        // The safe accessor lives in pivotResultsAsData and reads
        // `row[fieldId]?.value?.raw ?? ''` — locking the empty-string
        // fallback prevents a regression that re-introduces the throw.
        const partialRows: ResultRow[] = RESULT_ROWS_2DIM_2METRIC.map(
            (row, idx) => {
                if (idx === 1) {
                    // Strip the devices metric on one row to simulate a
                    // results-set missing a field that valuesColumns expects.
                    const { devices, ...rest } = row;
                    return rest;
                }
                return row;
            },
        );

        const callPivot = () =>
            pivotResultsAsCsv({
                pivotConfig: {
                    pivotDimensions: ['page'],
                    metricsAsRows: false,
                },
                rows: partialRows,
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
                undefinedCharacter: '',
            });

        expect(callPivot).not.toThrow();

        const result = callPivot();

        // The output is still a 2D string array of the same surface shape.
        expect(Array.isArray(result)).toBe(true);
        result.forEach((row) => {
            expect(Array.isArray(row)).toBe(true);
            row.forEach((cell) => {
                // No undefined cells leak through — the safe accessor
                // returns empty string when the source field is missing.
                expect(typeof cell).toBe('string');
            });
        });
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
