import { type ItemsMap } from '../types/field';
import { type ResultRow } from '../types/results';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '../visualizations/types';
import { convertSqlPivotedRowsToPivotData } from './pivotQueryResults';
import {
    COMPLEX_SQL_PIVOT_DETAILS,
    COMPLEX_SQL_PIVOTED_ROWS,
    EXPECTED_COMPLEX_PIVOT_DATA,
    EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
    EXPECTED_PIVOT_DATA,
    EXPECTED_PIVOT_DATA_METRICS_AS_ROWS,
    EXPECTED_PIVOT_DATA_WITH_TOTALS,
    getFieldMock,
    SQL_PIVOT_DETAILS,
    SQL_PIVOTED_ROWS,
} from './pivotQueryResults.mock';

describe('convertSqlPivotedRowsToPivotData', () => {
    it('should convert SQL-pivoted rows to PivotData format', () => {
        // Convert SQL Pivoted rows to PivotData
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });
        expect(result).toStrictEqual(EXPECTED_PIVOT_DATA);
    });

    it('should convert SQL-pivoted rows with totals to PivotData format', () => {
        // Convert SQL Pivoted rows to PivotData
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });
        expect(result).toStrictEqual(EXPECTED_PIVOT_DATA_WITH_TOTALS);
    });

    it('should convert SQL-pivoted rows with metricsAsRows: true to PivotData format', () => {
        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        expect(result).toStrictEqual(EXPECTED_PIVOT_DATA_METRICS_AS_ROWS);
    });

    it('should convert complex SQL-pivoted rows to PivotData format', () => {
        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: COMPLEX_SQL_PIVOTED_ROWS,
            pivotDetails: COMPLEX_SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        expect(result).toStrictEqual(EXPECTED_COMPLEX_PIVOT_DATA);
    });

    it('should convert complex SQL-pivoted rows with metric as rows to PivotData format', () => {
        // Convert SQL Pivoted rows to PivotData with metricsAsRows: true
        const result = convertSqlPivotedRowsToPivotData({
            rows: COMPLEX_SQL_PIVOTED_ROWS,
            pivotDetails: COMPLEX_SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'orders_is_completed',
                    'orders_promo_code',
                    'payments_total_revenue',
                    'orders_average_order_size',
                    'orders_total_order_amount',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => {
                if (fieldId === 'payments_total_revenue') {
                    return 'Payments Total revenue';
                }
                if (fieldId === 'orders_average_order_size') {
                    return 'Orders Average order size';
                }
                if (fieldId === 'orders_total_order_amount') {
                    return 'Orders Total order amount';
                }
                return fieldId;
            },
            groupedSubtotals: undefined,
        });

        expect(result).toStrictEqual(
            EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
        );
    });

    it('should limit pivot columns when columnLimit is provided', () => {
        const fullResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        const limitedResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            columnLimit: 2,
        });

        // Limited result should have exactly 2 pivot groups
        const limitedColumnCount = limitedResult.headerValues[0]?.length ?? 0;
        expect(limitedColumnCount).toBe(2);

        // Verify the retained groups are the FIRST 2 from the full result
        const fullHeaderValues = fullResult.headerValues[0]?.map(
            (h) => 'value' in h && h.value?.raw,
        );
        const limitedHeaderValues = limitedResult.headerValues[0]?.map(
            (h) => 'value' in h && h.value?.raw,
        );
        expect(limitedHeaderValues).toStrictEqual(
            fullHeaderValues?.slice(0, 2),
        );
    });

    it('should not filter when columnLimit is undefined', () => {
        const result1 = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        const result2 = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            columnLimit: undefined,
        });

        expect(result1).toStrictEqual(result2);
    });

    it('should treat columnLimit of 0 as no limit', () => {
        const fullResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        const zeroResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            columnLimit: 0,
        });

        expect(zeroResult).toStrictEqual(fullResult);
    });

    it('should keep only the first pivot group when columnLimit is 1', () => {
        const limitedResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            columnLimit: 1,
        });

        const limitedColumnCount = limitedResult.headerValues[0]?.length ?? 0;
        expect(limitedColumnCount).toBe(1);
    });

    it('should return all columns when columnLimit exceeds available', () => {
        const fullResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        const largeResult = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            columnLimit: 999,
        });

        expect(largeResult).toStrictEqual(fullResult);
    });
});

describe('parameter-aware cell formatting (PROD-437)', () => {
    // Metric formats that reference ${ld.parameters.*} can't be evaluated by
    // the backend (parameter values live on the client), so its `.formatted`
    // string carries the literal placeholder. For flat tables, useColumns
    // overlays a per-cell re-format. The pivot pipeline used to skip this
    // overlay — every cell, total and pivoted-metric header rendered the
    // unresolved format. This block covers the equivalent overlay in
    // convertSqlPivotedRowsToPivotData.

    const PARAMETER_FORMAT = '${ld.parameters.currency=="eur"?"€":"$"}0,0.00';

    const getFieldWithParameterFormat = (
        fieldId: string,
    ): ItemsMap[string] | undefined => {
        const field = getFieldMock(fieldId);
        if (field && fieldId === 'payments_total_revenue') {
            // `format` on TableCalculation is a CustomFormat object, but we
            // know payments_total_revenue is a Metric — cast to satisfy the
            // union's intersection.
            return { ...field, format: PARAMETER_FORMAT } as ItemsMap[string];
        }
        return field;
    };

    it('convertSqlPivotedRowsToPivotData reformats cells and row totals with active parameters', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
                columnTotals: true,
                metricsAsRows: false,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldWithParameterFormat,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            parameters: { currency: 'eur' },
        });

        const firstCell =
            result.retrofitData.allCombinedData[0]
                ?.payments_payment_method__payments_total_revenue__0;
        expect(firstCell?.value).toEqual({
            raw: 493.78,
            formatted: '€493.78',
        });

        const firstRowTotal =
            result.retrofitData.allCombinedData[0]?.['row-total-0'];
        expect(firstRowTotal?.value).toEqual({
            raw: 1746.77,
            formatted: '€1,746.77',
        });
    });
});

describe('convertSqlPivotedRowsToPivotData metric ordering (#19838 / #19919)', () => {
    it('orders metricsAsRows row labels by columnOrder, not valuesColumns first-occurrence', () => {
        // baseMetricsArray was previously derived via Array.from(new Set(...)),
        // which preserves valuesColumns first-occurrence order rather than the
        // user's metric selection sequence (columnOrder). With metricsAsRows: true
        // this produced metric label rows in the wrong order. Fixed in PR #19910
        // by sorting by columnOrder.indexOf.
        //
        // valuesColumns order in COMPLEX_SQL_PIVOT_DETAILS:
        //   payments_total_revenue, orders_average_order_size, orders_total_order_amount
        // columnOrder below intentionally reverses that, so the two derivations diverge.
        const columnOrder = [
            'payments_payment_method',
            'orders_order_date_year',
            'orders_is_completed',
            'orders_promo_code',
            'orders_total_order_amount',
            'payments_total_revenue',
            'orders_average_order_size',
        ];

        const result = convertSqlPivotedRowsToPivotData({
            rows: COMPLEX_SQL_PIVOTED_ROWS,
            pivotDetails: COMPLEX_SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: true,
                columnOrder,
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        // In metricsAsRows mode each indexValues row ends with a metric label.
        const metricRowOrder = result.indexValues
            .map((row) => row[row.length - 1])
            .filter(
                (entry): entry is { type: 'label'; fieldId: string } =>
                    entry.type === 'label',
            )
            .map((entry) => entry.fieldId);

        expect(metricRowOrder).toEqual([
            'orders_total_order_amount',
            'payments_total_revenue',
            'orders_average_order_size',
        ]);
    });
});

describe('passthrough dimensions (PROD-7873)', () => {
    // Two paths produce the same passthrough behavior:
    //   1. DECLARED — backend ran the query with `passthroughDimensions` in
    //      pivotConfiguration and surfaces it via `pivotDetails.passthroughDimensions`.
    //   2. INFERRED — user just hid a dim without re-running the query;
    //      pivotDetails is stale but the row data still carries the value,
    //      and we synthesize the passthrough from `hiddenDimensionFieldIds`.
    //
    // The two must produce identical shape (pivotColumnInfo + allCombinedData),
    // otherwise users see a flicker on the first render after hide vs. after refetch.

    const baseInputRow = {
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        // Passthrough dim's value sits on each row under its natural field id.
        orders_status_image_url: {
            value: {
                raw: 'https://placehold.co/60?text=A',
                formatted: 'https://placehold.co/60?text=A',
            },
        },
        payments_total_revenue_any_bank_transfer: {
            value: { raw: 100, formatted: '100' },
        },
    };

    it('declared and inferred paths produce identical pivotColumnInfo + allCombinedData', () => {
        const sharedArgs = {
            rows: [baseInputRow],
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId: string) => fieldId,
            groupedSubtotals: undefined,
        };

        // Path 1: backend declared the passthrough explicitly in pivotDetails.
        const declared = convertSqlPivotedRowsToPivotData({
            ...sharedArgs,
            pivotDetails: {
                ...SQL_PIVOT_DETAILS,
                passthroughDimensions: [
                    { reference: 'orders_status_image_url' },
                ],
            },
        });

        // Path 2: pivotDetails is stale (no passthroughDimensions yet) but
        // `hiddenDimensionFieldIds` carries the same intent and the row data
        // is still present — the inferred path picks it up.
        const inferred = convertSqlPivotedRowsToPivotData({
            ...sharedArgs,
            pivotDetails: {
                ...SQL_PIVOT_DETAILS,
                // no passthroughDimensions here
            },
            pivotConfig: {
                ...sharedArgs.pivotConfig,
                hiddenDimensionFieldIds: ['orders_status_image_url'],
            },
        });

        expect(declared.retrofitData.pivotColumnInfo).toEqual(
            inferred.retrofitData.pivotColumnInfo,
        );
        expect(declared.retrofitData.allCombinedData).toEqual(
            inferred.retrofitData.allCombinedData,
        );

        // Both paths must register the passthrough column with the right marker.
        const passthroughEntries = declared.retrofitData.pivotColumnInfo.filter(
            (c) => c.columnType === 'passthrough',
        );
        expect(passthroughEntries).toEqual([
            {
                fieldId: 'orders_status_image_url',
                baseId: 'orders_status_image_url',
                underlyingId: undefined,
                columnType: 'passthrough',
            },
        ]);
    });

    it('inferred path skips a hidden field that is already an indexColumn', () => {
        // If `orders_order_date_year` is hidden but still listed in
        // pivotDetails.indexColumn (cached-results-after-hide path), it must
        // NOT be inferred as a passthrough — it's already in TanStack's
        // column model via the index columns. Double-registering would
        // create duplicate cells in `getAllCells()`.
        const result = convertSqlPivotedRowsToPivotData({
            rows: [baseInputRow],
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
                // Hidden, but it's an index column — guard must skip it.
                hiddenDimensionFieldIds: ['orders_order_date_year'],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId: string) => fieldId,
            groupedSubtotals: undefined,
        });

        const passthroughEntries = result.retrofitData.pivotColumnInfo.filter(
            (c) => c.columnType === 'passthrough',
        );
        expect(passthroughEntries).toEqual([]);
    });

    // PROD-7933 regression. Before the fix, the post-retrofit merge did
    // `rows[outputRowIndex]` — but in `metricsAsRows: true` mode each input row
    // fans out to `baseMetricsArray.length` output rows, so the off-by-N
    // shifted passthrough values onto unrelated rows. Customer-visible symptom
    // was four metric rows of the same product carrying four *different*
    // product images.
    it('metricsAsRows: each metric row carries the passthrough value of its originating input row', () => {
        // Two input rows × two metrics → four output rows. If the merge ever
        // regresses back to `rows[rowIndex]`:
        //   - output 0 (row 0, metric 0) reads rows[0] → image_a ✓ (coincidence)
        //   - output 1 (row 0, metric 1) reads rows[1] → image_b ✗
        //   - output 2 (row 1, metric 0) reads rows[2] → undefined ✗
        //   - output 3 (row 1, metric 1) reads rows[3] → undefined ✗
        // The assertions below pin down all four positions, so any regression
        // (off-by-one, undefined-on-overflow, swapped pairing) will fail loudly.
        const rows: ResultRow[] = [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                orders_status_image_url: {
                    value: {
                        raw: 'https://placehold.co/60?text=A',
                        formatted: 'https://placehold.co/60?text=A',
                    },
                },
                payments_total_revenue_any_bank_transfer: {
                    value: { raw: 100, formatted: '100' },
                },
                orders_total_order_amount_any_bank_transfer: {
                    value: { raw: 200, formatted: '200' },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2024-01-01T00:00:00Z',
                        formatted: '2024',
                    },
                },
                orders_status_image_url: {
                    value: {
                        raw: 'https://placehold.co/60?text=B',
                        formatted: 'https://placehold.co/60?text=B',
                    },
                },
                payments_total_revenue_any_bank_transfer: {
                    value: { raw: 50, formatted: '50' },
                },
                orders_total_order_amount_any_bank_transfer: {
                    value: { raw: 75, formatted: '75' },
                },
            },
        ];

        const result = convertSqlPivotedRowsToPivotData({
            rows,
            pivotDetails: {
                totalColumnCount: 1,
                valuesColumns: [
                    {
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [
                            {
                                value: 'bank_transfer',
                                referenceField: 'payments_payment_method',
                            },
                        ],
                        referenceField: 'payments_total_revenue',
                        pivotColumnName:
                            'payments_total_revenue_any_bank_transfer',
                    },
                    {
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [
                            {
                                value: 'bank_transfer',
                                referenceField: 'payments_payment_method',
                            },
                        ],
                        referenceField: 'orders_total_order_amount',
                        pivotColumnName:
                            'orders_total_order_amount_any_bank_transfer',
                    },
                ],
                indexColumn: [
                    {
                        type: VizIndexType.TIME,
                        reference: 'orders_order_date_year',
                    },
                ],
                groupByColumns: [{ reference: 'payments_payment_method' }],
                passthroughDimensions: [
                    { reference: 'orders_status_image_url' },
                ],
                sortBy: [
                    {
                        direction: SortByDirection.DESC,
                        reference: 'orders_order_date_year',
                    },
                ],
                originalColumns: {},
            },
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: true,
                columnOrder: [
                    'orders_order_date_year',
                    'payments_payment_method',
                    'payments_total_revenue',
                    'orders_total_order_amount',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        // Sanity: two input rows × two metrics = four output rows.
        expect(result.retrofitData.allCombinedData).toHaveLength(4);

        // Output rows 0 and 1 are both expansions of input row 0 (year=2025)
        // — both must carry image A. Output rows 2 and 3 are both expansions
        // of input row 1 (year=2024) — both must carry image B.
        const imageUrls = result.retrofitData.allCombinedData.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r) => (r.orders_status_image_url as any)?.value?.raw,
        );
        expect(imageUrls).toEqual([
            'https://placehold.co/60?text=A',
            'https://placehold.co/60?text=A',
            'https://placehold.co/60?text=B',
            'https://placehold.co/60?text=B',
        ]);

        // The passthrough column is also registered with the right marker so
        // the frontend hides it via TanStack columnVisibility (PR #23452 flow).
        const passthroughEntries = result.retrofitData.pivotColumnInfo.filter(
            (c) => c.columnType === 'passthrough',
        );
        expect(passthroughEntries).toEqual([
            {
                fieldId: 'orders_status_image_url',
                baseId: 'orders_status_image_url',
                underlyingId: undefined,
                columnType: 'passthrough',
            },
        ]);
    });
});
