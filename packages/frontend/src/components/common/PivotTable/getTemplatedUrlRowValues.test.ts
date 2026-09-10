import { describe, expect, it } from 'vitest';
import {
    collectPivotBodyRowValues,
    collectPivotHeaderRowValues,
    type PivotRowContextCell,
} from './getTemplatedUrlRowValues';

const indexCell = (
    itemId: string,
    raw: unknown,
    formatted: string,
): PivotRowContextCell => ({
    type: 'indexValue',
    itemId,
    value: { value: { raw, formatted } },
    headerInfo: undefined,
});

const dataCell = (
    itemId: string,
    raw: unknown,
    formatted: string,
    headerInfo: PivotRowContextCell['headerInfo'],
): PivotRowContextCell => ({
    type: undefined,
    itemId,
    value: { value: { raw, formatted } },
    headerInfo,
});

const express = {
    orders_shipping_method: { raw: 'express', formatted: 'Express' },
};
const standard = {
    orders_shipping_method: { raw: 'standard', formatted: 'Standard' },
};

describe('collectPivotBodyRowValues', () => {
    const cells: PivotRowContextCell[] = [
        indexCell('customers_first_name', 'Ada', 'Ada'),
        indexCell('customers_customer_id', 7, '7'),
        dataCell('orders_total_order_amount', 32, '$32.00', express),
        dataCell('orders_order_count', 3, '3', express),
        dataCell('orders_total_order_amount', 10, '$10.00', standard),
        {
            type: 'rowTotal',
            itemId: 'orders_total_order_amount',
            value: { value: { raw: 42, formatted: '$42.00' } },
            headerInfo: undefined,
        },
    ];

    it('gives an index dim cell every index dim of its row and nothing pivoted', () => {
        const result = collectPivotBodyRowValues({
            cells,
            clickedColIndex: 0,
            labelFieldId: undefined,
            hiddenIndexCells: [],
            metricsAsRows: false,
        });

        expect(result).toEqual({
            customers_first_name: { raw: 'Ada', formatted: 'Ada' },
            customers_customer_id: { raw: 7, formatted: '7' },
        });
    });

    it('gives a data cell its pivot dims and sibling metrics under the same header only', () => {
        const result = collectPivotBodyRowValues({
            cells,
            clickedColIndex: 2,
            labelFieldId: undefined,
            hiddenIndexCells: [],
            metricsAsRows: false,
        });

        expect(result).toEqual({
            customers_first_name: { raw: 'Ada', formatted: 'Ada' },
            customers_customer_id: { raw: 7, formatted: '7' },
            orders_shipping_method: { raw: 'express', formatted: 'Express' },
            orders_total_order_amount: { raw: 32, formatted: '$32.00' },
            orders_order_count: { raw: 3, formatted: '3' },
        });
    });

    it('includes hidden passthrough dims like rendered index dims', () => {
        const result = collectPivotBodyRowValues({
            cells: [
                ...cells.slice(0, 1),
                {
                    type: 'passthrough',
                    itemId: 'customers_customer_id',
                    value: { value: { raw: 7, formatted: '7' } },
                    headerInfo: undefined,
                },
            ],
            clickedColIndex: 0,
            labelFieldId: undefined,
            hiddenIndexCells: [],
            metricsAsRows: false,
        });

        expect(result).toEqual({
            customers_first_name: { raw: 'Ada', formatted: 'Ada' },
            customers_customer_id: { raw: 7, formatted: '7' },
        });
    });

    it('merges hidden row-index dims', () => {
        const result = collectPivotBodyRowValues({
            cells: cells.slice(0, 1),
            clickedColIndex: 0,
            labelFieldId: undefined,
            hiddenIndexCells: [
                {
                    type: 'value',
                    fieldId: 'customers_customer_id',
                    value: { raw: 7, formatted: '7' },
                    colSpan: 1,
                },
            ],
            metricsAsRows: false,
        });

        expect(result.customers_customer_id).toEqual({
            raw: 7,
            formatted: '7',
        });
    });

    describe('metricsAsRows', () => {
        const metricsAsRowsCells: PivotRowContextCell[] = [
            indexCell('customers_first_name', 'Ada', 'Ada'),
            {
                type: 'label',
                itemId: undefined,
                value: undefined,
                headerInfo: undefined,
            },
            // data columns carry the last pivot dim as their item in this mode
            dataCell('orders_shipping_method', 32, '$32.00', express),
            dataCell('orders_shipping_method', 10, '$10.00', standard),
        ];

        it('maps a data cell to the row metric label and skips sibling columns', () => {
            const result = collectPivotBodyRowValues({
                cells: metricsAsRowsCells,
                clickedColIndex: 2,
                labelFieldId: 'orders_total_order_amount',
                hiddenIndexCells: [],
                metricsAsRows: true,
            });

            expect(result).toEqual({
                customers_first_name: { raw: 'Ada', formatted: 'Ada' },
                orders_shipping_method: {
                    raw: 'express',
                    formatted: 'Express',
                },
                orders_total_order_amount: { raw: 32, formatted: '$32.00' },
            });
        });

        it('does not assign an index dim value to the metric label', () => {
            const result = collectPivotBodyRowValues({
                cells: metricsAsRowsCells,
                clickedColIndex: 0,
                labelFieldId: 'orders_total_order_amount',
                hiddenIndexCells: [],
                metricsAsRows: true,
            });

            expect(result).toEqual({
                customers_first_name: { raw: 'Ada', formatted: 'Ada' },
            });
        });
    });
});

describe('collectPivotHeaderRowValues', () => {
    const headerValues = [
        [
            {
                type: 'value' as const,
                fieldId: 'orders_status',
                value: { raw: 'shipped', formatted: 'Shipped' },
                colSpan: 2,
            },
            {
                type: 'value' as const,
                fieldId: 'orders_status',
                value: { raw: 'shipped', formatted: 'Shipped' },
                colSpan: 0,
            },
        ],
        [
            {
                type: 'value' as const,
                fieldId: 'customers_first_name',
                value: { raw: 'Ada', formatted: 'Ada' },
                colSpan: 1,
            },
            {
                type: 'value' as const,
                fieldId: 'customers_first_name',
                value: { raw: 'Bob', formatted: 'Bob' },
                colSpan: 1,
            },
        ],
        [
            { type: 'label' as const, fieldId: 'orders_total_order_amount' },
            { type: 'label' as const, fieldId: 'orders_total_order_amount' },
        ],
    ];

    it('includes the cell and its ancestors in the same column, even through merged spans', () => {
        expect(collectPivotHeaderRowValues(headerValues, 1, 1)).toEqual({
            orders_status: { raw: 'shipped', formatted: 'Shipped' },
            customers_first_name: { raw: 'Bob', formatted: 'Bob' },
        });
    });

    it('excludes descendant levels for a top-level header', () => {
        expect(collectPivotHeaderRowValues(headerValues, 0, 0)).toEqual({
            orders_status: { raw: 'shipped', formatted: 'Shipped' },
        });
    });
});
