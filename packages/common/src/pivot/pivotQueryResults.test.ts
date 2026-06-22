import { type ItemsMap } from '../types/field';
import { type PivotData } from '../types/pivot';
import { type ResultRow } from '../types/results';
import { getPivotRowContextKey } from '../utils/conditionalFormatting';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '../visualizations/types';
import {
    buildPivotRowTotalKey,
    convertSqlPivotedRowsToPivotData,
} from './pivotQueryResults';
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

// Row totals are warehouse-only, so the tests feed the worker a warehouse map.
// Reconstruct that map from an expected fixture's own row totals + index values
// (using the row's metric label for metrics-as-rows, or the total column's
// field for metrics-as-columns) so fixtures stay the single source of truth.
const buildWarehouseRowTotalsFromExpected = (
    expected: PivotData,
): Record<string, Record<string, number>> => {
    const map: Record<string, Record<string, number>> = {};
    const fields = expected.rowTotalFields ?? [];
    const lastFields = fields[fields.length - 1] ?? [];
    (expected.rowTotals ?? []).forEach((totalsRow, rowIndex) => {
        const indexCells = expected.indexValues[rowIndex] ?? [];
        const entries = indexCells
            .filter((cell) => cell.type === 'value')
            .map((cell): [string, unknown] => [
                cell.fieldId,
                cell.type === 'value' ? cell.value?.raw : undefined,
            ]);
        const key = buildPivotRowTotalKey(entries);
        if (!map[key]) map[key] = {};
        const labelCell = indexCells.find((cell) => cell.type === 'label');
        totalsRow.forEach((value, colIndex) => {
            if (typeof value !== 'number') return;
            const metricFieldId =
                labelCell?.fieldId ?? lastFields[colIndex]?.fieldId;
            if (metricFieldId) map[key][metricFieldId] = value;
        });
    });
    return map;
};

// Column totals are warehouse-only too. Reconstruct the warehouse map (keyed by
// pivot SQL column name, `<metric>_any_<pivotValue...>`) from an expected
// fixture's columnTotals + headerValues so fixtures stay the source of truth.
const buildWarehouseColumnTotalsFromExpected = (
    expected: PivotData,
): Record<string, number> => {
    const map: Record<string, number> = {};
    const { columnTotals, columnTotalFields, headerValues, pivotConfig } =
        expected;
    if (!columnTotals || !columnTotalFields) return map;

    const pivotValuesForColumn = (
        dimRows: PivotData['headerValues'],
        colIndex: number,
    ): string[] | undefined => {
        const values = dimRows.map((dimRow) => {
            const cell = dimRow[colIndex];
            return cell && cell.type === 'value'
                ? String(cell.value?.raw)
                : undefined;
        });
        return values.some((v) => v === undefined)
            ? undefined
            : (values as string[]);
    };

    const metricRow = headerValues[headerValues.length - 1] ?? [];
    const pivotDimRows = pivotConfig.metricsAsRows
        ? headerValues
        : headerValues.slice(0, -1);

    columnTotals.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
            if (typeof value !== 'number') return;
            const metricFieldId = pivotConfig.metricsAsRows
                ? columnTotalFields[rowIndex]?.find((f) => f?.fieldId)?.fieldId
                : metricRow[colIndex]?.fieldId;
            if (!metricFieldId) return;
            const pivotValues = pivotValuesForColumn(pivotDimRows, colIndex);
            if (!pivotValues) return;
            map[[metricFieldId, 'any', ...pivotValues].join('_')] = value;
        });
    });
    return map;
};

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
            warehouseRowTotals: buildWarehouseRowTotalsFromExpected(
                EXPECTED_PIVOT_DATA_WITH_TOTALS,
            ),
            warehouseColumnTotals: buildWarehouseColumnTotalsFromExpected(
                EXPECTED_PIVOT_DATA_WITH_TOTALS,
            ),
        });
        expect(result).toStrictEqual(EXPECTED_PIVOT_DATA_WITH_TOTALS);
    });

    it('uses warehouse row totals instead of the client-side sum when provided', () => {
        const warehouseRowTotals = {
            [buildPivotRowTotalKey([
                ['orders_order_date_year', '2025-01-01T00:00:00Z'],
            ])]: { payments_total_revenue: 999 },
            [buildPivotRowTotalKey([
                ['orders_order_date_year', '2024-01-01T00:00:00Z'],
            ])]: { payments_total_revenue: 888 },
            [buildPivotRowTotalKey([
                ['orders_order_date_year', '2023-01-01T00:00:00Z'],
            ])]: { payments_total_revenue: 777 },
        };

        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
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
            warehouseRowTotals,
        });

        // Warehouse values replace the client-side sums (1746.77 / 1189.6 / 117.5)
        expect(result.rowTotals).toStrictEqual([[999], [888], [777]]);
        // The total column is still attributed to the metric field
        expect(
            result.rowTotalFields?.[result.rowTotalFields.length - 1],
        ).toEqual([{ fieldId: 'payments_total_revenue' }]);
    });

    it('leaves the row total null (no client-side fallback) when a warehouse value is missing', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
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
            // Only the 2025 row has a warehouse total; the others stay blank.
            warehouseRowTotals: {
                [buildPivotRowTotalKey([
                    ['orders_order_date_year', '2025-01-01T00:00:00Z'],
                ])]: { payments_total_revenue: 999 },
            },
        });

        expect(result.rowTotals).toStrictEqual([[999], [null], [null]]);
    });

    it('leaves all row totals null when no warehouse totals are provided', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
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

        // No client-side computation: the column is allocated but blank.
        expect(result.rowTotals).toStrictEqual([[null], [null], [null]]);
        expect(
            result.rowTotalFields?.[result.rowTotalFields.length - 1],
        ).toEqual([{ fieldId: 'payments_total_revenue' }]);
    });

    it('matches warehouse totals keyed by the `<metric>_any` column and `.000Z` dates (real wire shape)', () => {
        // The flat totals query streams metric columns with the aggregation
        // suffix and dates with milliseconds — different from the pivot rows'
        // `...00Z`. Both must still match the rendered rows.
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: true,
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
            warehouseRowTotals: {
                [buildPivotRowTotalKey([
                    ['orders_order_date_year', '2025-01-01T00:00:00.000Z'],
                ])]: { payments_total_revenue_any: 999 },
                [buildPivotRowTotalKey([
                    ['orders_order_date_year', '2024-01-01T00:00:00.000Z'],
                ])]: { payments_total_revenue_any: 888 },
                [buildPivotRowTotalKey([
                    ['orders_order_date_year', '2023-01-01T00:00:00.000Z'],
                ])]: { payments_total_revenue_any: 777 },
            },
        });

        expect(result.rowTotals).toStrictEqual([[999], [888], [777]]);
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
            warehouseRowTotals: buildWarehouseRowTotalsFromExpected(
                EXPECTED_PIVOT_DATA_METRICS_AS_ROWS,
            ),
            warehouseColumnTotals: buildWarehouseColumnTotalsFromExpected(
                EXPECTED_PIVOT_DATA_METRICS_AS_ROWS,
            ),
        });

        expect(result).toStrictEqual(EXPECTED_PIVOT_DATA_METRICS_AS_ROWS);
    });

    it('uses warehouse row totals for metrics-as-rows pivots with no index dimensions', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: [SQL_PIVOTED_ROWS[0]],
            pivotDetails: {
                ...SQL_PIVOT_DETAILS,
                indexColumn: undefined,
            },
            pivotConfig: {
                rowTotals: true,
                columnTotals: false,
                metricsAsRows: true,
                columnOrder: [
                    'payments_payment_method',
                    'orders_order_date_year',
                    'payments_total_revenue',
                ],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
            warehouseRowTotals: {
                [buildPivotRowTotalKey([])]: {
                    payments_total_revenue_any: 999,
                },
            },
        });

        expect(result.indexValues).toStrictEqual([
            [{ type: 'label', fieldId: 'payments_total_revenue' }],
        ]);
        expect(result.rowTotals).toStrictEqual([[999]]);
        expect(result.retrofitData.allCombinedData[0]['row-total-0']).toEqual({
            value: {
                raw: 999,
                formatted: '999',
            },
        });
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
            warehouseRowTotals: buildWarehouseRowTotalsFromExpected(
                EXPECTED_COMPLEX_PIVOT_DATA,
            ),
            warehouseColumnTotals: buildWarehouseColumnTotalsFromExpected(
                EXPECTED_COMPLEX_PIVOT_DATA,
            ),
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
            warehouseRowTotals: buildWarehouseRowTotalsFromExpected(
                EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
            ),
            warehouseColumnTotals: buildWarehouseColumnTotalsFromExpected(
                EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
            ),
        });

        expect(result).toStrictEqual(
            EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS,
        );

        // metricsAsRows column totals must include a footer row for every
        // visible metric — including the non-summable avg — so warehouse
        // totals can be overlaid for all metric types.
        const totalMetricIds = result.columnTotalFields?.map(
            (row) => row.find((cell) => cell?.fieldId)?.fieldId,
        );
        expect(totalMetricIds).toEqual([
            'payments_total_revenue',
            'orders_average_order_size',
            'orders_total_order_amount',
        ]);
    });

    it('leaves column totals null (no client-side fallback) without warehouse values', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
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

        // The total row is allocated but every cell is blank until warehouse
        // column totals are provided — there is no in-memory summation.
        expect(result.columnTotals).toStrictEqual([[null, null, null, null]]);
    });

    it('fills only the column totals present in the warehouse map', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows: SQL_PIVOTED_ROWS,
            pivotDetails: SQL_PIVOT_DETAILS,
            pivotConfig: {
                rowTotals: false,
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
            // Only two of the four pivot columns have a warehouse total.
            warehouseColumnTotals: {
                payments_total_revenue_any_bank_transfer: 111,
                payments_total_revenue_any_credit_card: 333,
            },
        });

        expect(result.columnTotals).toStrictEqual([[111, null, 333, null]]);
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
            warehouseRowTotals: buildWarehouseRowTotalsFromExpected(
                EXPECTED_PIVOT_DATA_WITH_TOTALS,
            ),
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

describe('hidden-metric conditional-formatting side-channel (PROD-2372)', () => {
    // One index dim (year), one pivot dim (payment method), two metrics where
    // one is hidden. The hidden metric is filtered out of the visible output,
    // but its pivoted values must be stashed on `hiddenContextValues` keyed by
    // the displayed dimension context so a CF rule referencing it still resolves.
    const rows: ResultRow[] = [
        {
            orders_order_date_year: {
                value: { raw: '2025-01-01T00:00:00Z', formatted: '2025' },
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
                value: { raw: '2024-01-01T00:00:00Z', formatted: '2024' },
            },
            payments_total_revenue_any_bank_transfer: {
                value: { raw: 50, formatted: '50' },
            },
            orders_total_order_amount_any_bank_transfer: {
                value: { raw: 75, formatted: '75' },
            },
        },
    ];

    const pivotDetails = {
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
                pivotColumnName: 'payments_total_revenue_any_bank_transfer',
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
                pivotColumnName: 'orders_total_order_amount_any_bank_transfer',
            },
        ],
        indexColumn: [
            {
                type: VizIndexType.TIME,
                reference: 'orders_order_date_year',
            },
        ],
        groupByColumns: [{ reference: 'payments_payment_method' }],
        sortBy: [
            {
                direction: SortByDirection.DESC,
                reference: 'orders_order_date_year',
            },
        ],
        originalColumns: {},
    };

    it('stashes the hidden metric value keyed by index + header dims, without changing the visible output shape', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows,
            pivotDetails,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
                columnOrder: [
                    'orders_order_date_year',
                    'payments_payment_method',
                    'payments_total_revenue',
                    'orders_total_order_amount',
                ],
                hiddenMetricFieldIds: ['orders_total_order_amount'],
            },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        // Visible output only carries the one visible metric (revenue): one
        // pivot column group, so dataValues has exactly one column per row.
        expect(result.dataColumnCount).toBe(1);
        result.dataValues.forEach((row) => {
            expect(row).toHaveLength(1);
        });

        expect(result.hiddenContextValues).toBeDefined();

        const key2025 = getPivotRowContextKey({
            orders_order_date_year: '2025-01-01T00:00:00Z',
            payments_payment_method: 'bank_transfer',
        });
        expect(result.hiddenContextValues![key2025]).toEqual({
            orders_total_order_amount: { raw: 200, formatted: '200' },
        });

        const key2024 = getPivotRowContextKey({
            orders_order_date_year: '2024-01-01T00:00:00Z',
            payments_payment_method: 'bank_transfer',
        });
        expect(result.hiddenContextValues![key2024]).toEqual({
            orders_total_order_amount: { raw: 75, formatted: '75' },
        });
    });

    it('omits hiddenContextValues entirely when no metric is hidden', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows,
            pivotDetails,
            pivotConfig: {
                rowTotals: false,
                columnTotals: false,
                metricsAsRows: false,
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

        expect(result.hiddenContextValues).toBeUndefined();
    });
});

describe('hidden row-index dim drill-down side-channel (PROD-7841)', () => {
    // Two index dims: a visible one (year) and a hidden one (cost tier). The
    // hidden index dim is dropped from the rendered `indexValues`, but its
    // per-row value must be stashed on `hiddenIndexValues` so interactive
    // drill-down can still scope by it.
    const rows: ResultRow[] = [
        {
            orders_order_date_year: {
                value: { raw: '2025-01-01T00:00:00Z', formatted: '2025' },
            },
            orders_shipping_cost_tier: {
                value: { raw: 'high', formatted: 'High ($20-$30)' },
            },
            orders_total_order_amount_any_bank_transfer: {
                value: { raw: 200, formatted: '200' },
            },
        },
        {
            orders_order_date_year: {
                value: { raw: '2024-01-01T00:00:00Z', formatted: '2024' },
            },
            orders_shipping_cost_tier: {
                value: { raw: 'low', formatted: 'Low (<$10)' },
            },
            orders_total_order_amount_any_bank_transfer: {
                value: { raw: 75, formatted: '75' },
            },
        },
    ];

    const pivotDetails = {
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
                referenceField: 'orders_total_order_amount',
                pivotColumnName: 'orders_total_order_amount_any_bank_transfer',
            },
        ],
        indexColumn: [
            { type: VizIndexType.TIME, reference: 'orders_order_date_year' },
            {
                type: VizIndexType.CATEGORY,
                reference: 'orders_shipping_cost_tier',
            },
        ],
        groupByColumns: [{ reference: 'payments_payment_method' }],
        sortBy: [
            {
                direction: SortByDirection.DESC,
                reference: 'orders_order_date_year',
            },
        ],
        originalColumns: {},
    };

    const pivotConfig = {
        rowTotals: false,
        columnTotals: false,
        metricsAsRows: false,
        columnOrder: [
            'orders_order_date_year',
            'orders_shipping_cost_tier',
            'payments_payment_method',
            'orders_total_order_amount',
        ],
        hiddenDimensionFieldIds: ['orders_shipping_cost_tier'],
    };

    it('stashes hidden index dim values on hiddenIndexValues, aligned by row, and excludes them from indexValues', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows,
            pivotDetails,
            pivotConfig,
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        // Rendered index values carry only the visible dim (year), never the
        // hidden cost tier.
        result.indexValues.forEach((indexRow) => {
            expect(indexRow.map((cell) => cell.fieldId)).not.toContain(
                'orders_shipping_cost_tier',
            );
        });
        expect(result.indexValues[0]).toEqual([
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: { raw: '2025-01-01T00:00:00Z', formatted: '2025' },
                colSpan: 1,
            },
        ]);

        // Hidden index dim values are stashed, aligned by row index, so
        // drill-down can scope by them.
        expect(result.hiddenIndexValues).toEqual([
            [
                {
                    type: 'value',
                    fieldId: 'orders_shipping_cost_tier',
                    value: { raw: 'high', formatted: 'High ($20-$30)' },
                    colSpan: 1,
                },
            ],
            [
                {
                    type: 'value',
                    fieldId: 'orders_shipping_cost_tier',
                    value: { raw: 'low', formatted: 'Low (<$10)' },
                    colSpan: 1,
                },
            ],
        ]);
    });

    it('omits hiddenIndexValues entirely when no index dim is hidden', () => {
        const result = convertSqlPivotedRowsToPivotData({
            rows,
            pivotDetails,
            pivotConfig: { ...pivotConfig, hiddenDimensionFieldIds: [] },
            getField: getFieldMock,
            getFieldLabel: (fieldId) => fieldId,
            groupedSubtotals: undefined,
        });

        expect(result.hiddenIndexValues).toBeUndefined();
    });
});
