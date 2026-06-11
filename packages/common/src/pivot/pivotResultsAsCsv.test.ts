import { type ItemsMap } from '../types/field';
import type { ResultRow } from '../types/results';
import { pivotResultsAsCsv, pivotResultsAsData } from './pivotQueryResults';
import {
    getFieldMock,
    SQL_PIVOT_DETAILS,
    SQL_PIVOTED_ROWS,
} from './pivotQueryResults.mock';

const buildItemsMap = (): ItemsMap => {
    const fieldIds = [
        'payments_payment_method',
        'orders_order_date_year',
        'payments_total_revenue',
    ];
    const map: ItemsMap = {};
    fieldIds.forEach((id) => {
        const field = getFieldMock(id);
        if (field) map[id] = field;
    });
    return map;
};

const PIVOT_CONFIG = {
    pivotDimensions: ['payments_payment_method'],
    metricsAsRows: false,
    columnOrder: [
        'payments_payment_method',
        'orders_order_date_year',
        'payments_total_revenue',
    ],
};

describe('pivotResultsAsCsv', () => {
    it('returns string[][] with headers and formatted data rows', () => {
        const result = pivotResultsAsCsv({
            pivotConfig: PIVOT_CONFIG,
            rows: SQL_PIVOTED_ROWS,
            itemMap: buildItemsMap(),
            customLabels: undefined,
            onlyRaw: false,
            pivotDetails: SQL_PIVOT_DETAILS,
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
            pivotConfig: PIVOT_CONFIG,
            rows: SQL_PIVOTED_ROWS,
            itemMap: buildItemsMap(),
            customLabels: { payments_total_revenue: 'Total Revenue!!' },
            onlyRaw: false,
            pivotDetails: SQL_PIVOT_DETAILS,
        });

        const allValues = result.flat();
        expect(allValues).toContain('Total Revenue!!');
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
        const partialRows: ResultRow[] = SQL_PIVOTED_ROWS.map((row, idx) => {
            if (idx === 1) {
                // Strip one pivot value column on one row to simulate a
                // results set missing a field that valuesColumns expects.
                const rest = { ...row };
                delete rest.payments_total_revenue_any_coupon;
                return rest;
            }
            return row;
        });

        const callPivot = () =>
            pivotResultsAsCsv({
                pivotConfig: PIVOT_CONFIG,
                rows: partialRows,
                itemMap: buildItemsMap(),
                customLabels: undefined,
                onlyRaw: false,
                pivotDetails: SQL_PIVOT_DETAILS,
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
            pivotConfig: PIVOT_CONFIG,
            rows: SQL_PIVOTED_ROWS,
            itemMap: buildItemsMap(),
            customLabels: undefined,
            onlyRaw: false,
            pivotDetails: SQL_PIVOT_DETAILS,
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

    it('appends a column totals footer row when columnTotals is enabled', () => {
        const baseParams = {
            pivotConfig: PIVOT_CONFIG,
            rows: SQL_PIVOTED_ROWS,
            itemMap: buildItemsMap(),
            customLabels: undefined,
            onlyRaw: false,
            pivotDetails: SQL_PIVOT_DETAILS,
        };
        const withoutTotals = pivotResultsAsCsv(baseParams);

        const withTotals = pivotResultsAsCsv({
            ...baseParams,
            pivotConfig: { ...PIVOT_CONFIG, columnTotals: true },
            warehouseColumnTotals: {
                payments_total_revenue_any_bank_transfer: 806.18,
                payments_total_revenue_any_coupon: 258.64,
                payments_total_revenue_any_credit_card: 1452.16,
                payments_total_revenue_any_gift_card: 536.89,
            },
        });

        // Exactly one extra row (the column totals footer)
        expect(withTotals.length).toBe(withoutTotals.length + 1);

        const footer = withTotals[withTotals.length - 1];
        // Footer width matches the body rows
        expect(footer.length).toBe(withTotals[withTotals.length - 2].length);
        // "Total" label in the index column, then the per-column totals
        expect(footer[0]).toBe('Total');
        expect(footer).toContain('806.18');
        expect(footer).toContain('258.64');
        expect(footer).toContain('536.89');
    });

    describe('passthrough dimension filtering (PROD-7873)', () => {
        // SQL-pivot path: when a hidden dim is carried through SQL as
        // `passthroughDimensions` so its values can be referenced by
        // cross-field richText / image templates, those values must NOT
        // leak into CSV / XLSX exports — the "hide" semantic includes
        // exports.
        it('omits passthrough dim values from CSV output even when present on rows', () => {
            const rows: ResultRow[] = [
                {
                    page: { value: { raw: '/home', formatted: '/home' } },
                    site_image_url: {
                        value: {
                            raw: 'https://placehold.co/60?text=Blog',
                            formatted: 'https://placehold.co/60?text=Blog',
                        },
                    },
                    views_sum: { value: { raw: 6, formatted: '6.0' } },
                },
                {
                    page: { value: { raw: '/about', formatted: '/about' } },
                    site_image_url: {
                        value: {
                            raw: 'https://placehold.co/60?text=Docs',
                            formatted: 'https://placehold.co/60?text=Docs',
                        },
                    },
                    views_sum: { value: { raw: 12, formatted: '12.0' } },
                },
            ];

            const result = pivotResultsAsCsv({
                pivotConfig: {
                    pivotDimensions: [],
                    metricsAsRows: false,
                    hiddenDimensionFieldIds: ['site_image_url'],
                },
                rows,
                itemMap: buildItemsMap(),
                customLabels: undefined,
                onlyRaw: false,
                pivotDetails: {
                    totalColumnCount: 1,
                    valuesColumns: [
                        {
                            aggregation: 'any' as never,
                            pivotValues: [],
                            referenceField: 'views',
                            pivotColumnName: 'views_sum',
                        },
                    ],
                    indexColumn: [
                        { type: 'category' as never, reference: 'page' },
                    ],
                    groupByColumns: [],
                    sortBy: undefined,
                    originalColumns: {},
                    passthroughDimensions: [{ reference: 'site_image_url' }],
                },
            });

            const allValues = result.flat();
            // Passthrough field id must not appear in the CSV
            expect(allValues).not.toContain('site_image_url');
            // Passthrough values (the placeholder URLs) must not leak
            expect(allValues.some((v) => v.includes('placehold.co'))).toBe(
                false,
            );
            // The visible index dim and metric must still appear
            expect(allValues).toContain('/home');
            expect(allValues).toContain('6.0');
        });
    });
});
