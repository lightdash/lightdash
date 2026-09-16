import { FieldType, type PivotData } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getVisiblePivotHeaderRows } from './getVisiblePivotHeaderRows';

const data: Pick<
    PivotData,
    'headerValues' | 'headerValueTypes' | 'titleFields' | 'rowTotalFields'
> = {
    headerValueTypes: [
        { type: FieldType.DIMENSION, fieldId: 'sale_date' },
        { type: FieldType.METRIC },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'sale_date',
                value: { raw: '2026-06-29', formatted: '29-Jun' },
                colSpan: 2,
            },
            {
                type: 'value',
                fieldId: 'sale_date',
                value: { raw: '2026-06-29', formatted: '29-Jun' },
                colSpan: 0,
            },
        ],
        [
            { type: 'label', fieldId: 'applications' },
            { type: 'label', fieldId: 'revenue' },
        ],
    ],
    titleFields: [[{ fieldId: 'sale_date', direction: 'header' }], [null]],
    rowTotalFields: [
        [null, null],
        [{ fieldId: 'applications' }, { fieldId: 'revenue' }],
    ],
};

describe('getVisiblePivotHeaderRows', () => {
    it.each([1, 2])(
        'removes metric headers with %s metrics, retaining values, spans and total columns',
        (metricCount) => {
            const pivot = {
                ...data,
                headerValues: data.headerValues.map((row) =>
                    row.slice(0, metricCount).map((cell, index) =>
                        cell.type === 'value'
                            ? {
                                  ...cell,
                                  colSpan: index === 0 ? metricCount : 0,
                              }
                            : cell,
                    ),
                ),
                rowTotalFields: data.rowTotalFields?.map((row) =>
                    row.slice(0, metricCount),
                ),
            };
            const rows = getVisiblePivotHeaderRows(pivot, {
                hideMetricNames: true,
            });
            expect(rows).toEqual([
                {
                    headerRowIndex: 0,
                    headerValues: pivot.headerValues[0],
                    titleFields: [
                        { fieldId: 'sale_date', direction: 'header' },
                    ],
                    rowTotalFields: metricCount === 1 ? [{}] : [{}, {}],
                },
            ]);
            expect(pivot.headerValues).toHaveLength(2);
            expect(pivot.rowTotalFields?.[1][0]).toEqual({
                fieldId: 'applications',
            });
        },
    );

    it.each([false, true])(
        'hides dimension names independently (hideMetricNames=%s)',
        (hideMetricNames) => {
            const rows = getVisiblePivotHeaderRows(data, {
                hideMetricNames,
                hidePivotDimensionNames: true,
            });
            expect(rows).toHaveLength(hideMetricNames ? 1 : 2);
            expect(rows[0].titleFields).toEqual([null]);
            expect(rows[0].headerValues).toEqual(data.headerValues[0]);
        },
    );

    it.each([false, true])(
        'preserves row-axis headings when removing the metric row (hidePivotDimensionNames=%s)',
        (hidePivotDimensionNames) => {
            const rows = getVisiblePivotHeaderRows(
                {
                    ...data,
                    titleFields: [
                        [{ fieldId: 'sale_date', direction: 'header' }],
                        [{ fieldId: 'region', direction: 'index' }],
                    ],
                },
                { hideMetricNames: true, hidePivotDimensionNames },
            );
            expect(rows[0].titleFields).toEqual([
                { fieldId: 'region', direction: 'index' },
            ]);
        },
    );

    it('keeps a header when no pivot dimension values remain', () => {
        const rows = getVisiblePivotHeaderRows(
            {
                ...data,
                headerValueTypes: [{ type: FieldType.METRIC }],
                headerValues: [data.headerValues[1]],
                titleFields: [[{ fieldId: 'region', direction: 'index' }]],
            },
            { hideMetricNames: true },
        );
        expect(rows).toHaveLength(1);
    });

    it.each([{}, { hideMetricNames: false, hidePivotDimensionNames: false }])(
        'keeps existing headers unchanged for %j',
        (config) => {
            const rows = getVisiblePivotHeaderRows(data, config);
            expect(rows.map((row) => row.headerValues)).toEqual(
                data.headerValues,
            );
            expect(rows.map((row) => row.titleFields)).toEqual(
                data.titleFields,
            );
            expect(rows.map((row) => row.rowTotalFields)).toEqual(
                data.rowTotalFields,
            );
        },
    );

    it('keeps dimension value levels and row-axis names with metrics as rows', () => {
        const rows = getVisiblePivotHeaderRows(
            {
                headerValueTypes: [
                    { type: FieldType.DIMENSION, fieldId: 'sale_date' },
                    { type: FieldType.DIMENSION, fieldId: 'region' },
                ],
                headerValues: [
                    data.headerValues[0],
                    [
                        {
                            type: 'value',
                            fieldId: 'region',
                            value: { raw: 'West', formatted: 'West' },
                            colSpan: 1,
                        },
                    ],
                ],
                titleFields: [
                    [{ fieldId: 'sale_date', direction: 'header' }],
                    [{ fieldId: 'customer', direction: 'index' }],
                ],
            },
            { hideMetricNames: true, hidePivotDimensionNames: true },
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].titleFields).toEqual([null]);
        expect(rows[1].titleFields).toEqual([
            { fieldId: 'customer', direction: 'index' },
        ]);
        expect(rows[1].headerValues).toEqual([
            {
                type: 'value',
                fieldId: 'region',
                value: { raw: 'West', formatted: 'West' },
                colSpan: 1,
            },
        ]);
    });
});
