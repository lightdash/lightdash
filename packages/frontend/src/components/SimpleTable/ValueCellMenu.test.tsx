import { describe, expect, it } from 'vitest';
import { collectPivotUnderlyingValues } from '../common/PivotTable/getUnderlyingFieldValues';

/**
 * Regression tests for ValueCellMenu drill-down behaviour with hidden pivot
 * dimensions (PROD-7841).
 *
 * The value-collection logic behind PivotTable's `getUnderlyingFieldValues`
 * — which produces the `fieldId -> value` context passed to
 * `openUnderlyingDataModal` / `openDrillDownModal` — was extracted into the
 * pure `collectPivotUnderlyingValues` helper so it can be unit-tested without
 * mounting a TanStack Table + React tree.
 *
 * The headline guard: row-index dims hidden via `hiddenDimensionFieldIds` are
 * excluded from the rendered cells, so they are now supplied separately via
 * `hiddenIndexCells` (from `PivotData.hiddenIndexValues`) and must end up in the
 * drill-down context — otherwise "View underlying data" / "Drill into" silently
 * widens its scope.
 */
describe('collectPivotUnderlyingValues — drill-down with hidden pivot dims', () => {
    const tierCell = {
        type: 'value' as const,
        fieldId: 'orders_shipping_cost_tier',
        value: { raw: 'high', formatted: 'High ($20-$30)' },
        colSpan: 1,
    };

    it('includes a hidden row-index dim value in the drill-down context', () => {
        const result = collectPivotUnderlyingValues({
            cells: [
                {
                    type: 'indexValue',
                    id: 'orders_order_date_month',
                    value: {
                        value: { raw: '2026-01-01', formatted: '2026-01' },
                    },
                    headerInfo: undefined,
                },
                {
                    type: undefined,
                    id: 'col_0',
                    value: { value: { raw: 32, formatted: '$32.00' } },
                    headerInfo: {
                        orders_shipping_method: {
                            raw: 'express',
                            formatted: 'express',
                        },
                    },
                },
            ],
            clickedColIndex: 1,
            clickedItemId: 'orders_total_order_amount',
            clickedValue: { raw: 32, formatted: '$32.00' },
            labelFieldId: undefined,
            hiddenIndexCells: [tierCell],
        });

        expect(result).toEqual({
            orders_total_order_amount: { raw: 32, formatted: '$32.00' },
            orders_order_date_month: {
                raw: '2026-01-01',
                formatted: '2026-01',
            },
            orders_shipping_method: { raw: 'express', formatted: 'express' },
            // The hidden dim is recovered from hiddenIndexCells.
            orders_shipping_cost_tier: {
                raw: 'high',
                formatted: 'High ($20-$30)',
            },
        });
    });

    it('omits the hidden dim when no hiddenIndexCells are supplied (documents the pre-fix gap)', () => {
        const result = collectPivotUnderlyingValues({
            cells: [
                {
                    type: 'indexValue',
                    id: 'orders_order_date_month',
                    value: {
                        value: { raw: '2026-01-01', formatted: '2026-01' },
                    },
                    headerInfo: undefined,
                },
            ],
            clickedColIndex: 0,
            clickedItemId: 'orders_total_order_amount',
            clickedValue: { raw: 32, formatted: '$32.00' },
            labelFieldId: undefined,
            hiddenIndexCells: [],
        });

        expect(result).not.toHaveProperty('orders_shipping_cost_tier');
    });

    it('maps the clicked metric value to the label field in metricsAsRows mode and still merges the hidden dim', () => {
        const result = collectPivotUnderlyingValues({
            cells: [
                {
                    type: 'label',
                    id: 'label-0',
                    value: {
                        value: {
                            raw: 'Total order amount',
                            formatted: 'Total order amount',
                        },
                    },
                    headerInfo: undefined,
                },
                {
                    type: undefined,
                    id: 'col_0',
                    value: { value: { raw: 32, formatted: '$32.00' } },
                    headerInfo: {
                        orders_order_date_month: {
                            raw: '2026-01-01',
                            formatted: '2026-01',
                        },
                    },
                },
            ],
            clickedColIndex: 1,
            clickedItemId: undefined,
            clickedValue: { raw: 32, formatted: '$32.00' },
            labelFieldId: 'orders_total_order_amount',
            hiddenIndexCells: [tierCell],
        });

        expect(result).toEqual({
            orders_total_order_amount: { raw: 32, formatted: '$32.00' },
            orders_order_date_month: {
                raw: '2026-01-01',
                formatted: '2026-01',
            },
            orders_shipping_cost_tier: {
                raw: 'high',
                formatted: 'High ($20-$30)',
            },
        });
    });

    it('merges pivot-dim headerInfo only for the clicked column', () => {
        const result = collectPivotUnderlyingValues({
            cells: [
                {
                    type: undefined,
                    id: 'c0',
                    value: { value: { raw: 1, formatted: '1' } },
                    headerInfo: {
                        orders_order_date_month: {
                            raw: '2026-01-01',
                            formatted: '2026-01',
                        },
                    },
                },
                {
                    type: undefined,
                    id: 'c1',
                    value: { value: { raw: 2, formatted: '2' } },
                    headerInfo: {
                        orders_order_date_month: {
                            raw: '2026-02-01',
                            formatted: '2026-02',
                        },
                    },
                },
            ],
            clickedColIndex: 1,
            clickedItemId: 'orders_total_order_amount',
            clickedValue: { raw: 2, formatted: '2' },
            labelFieldId: undefined,
            hiddenIndexCells: [],
        });

        // Only the clicked column's month context is included.
        expect(result.orders_order_date_month).toEqual({
            raw: '2026-02-01',
            formatted: '2026-02',
        });
    });
});
