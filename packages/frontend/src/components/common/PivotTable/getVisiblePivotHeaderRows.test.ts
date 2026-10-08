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
        'removes the metric row and the dimension name with %s metrics, keeping values, spans and total columns',
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
                    index: 0,
                    values: pivot.headerValues[0],
                    titleFields: [null],
                    rowTotalFields: metricCount === 1 ? [{}] : [{}, {}],
                },
            ]);
            // the pivot data itself is left alone
            expect(pivot.headerValues).toHaveLength(2);
            expect(pivot.titleFields[0]).toEqual([
                { fieldId: 'sale_date', direction: 'header' },
            ]);
            expect(pivot.rowTotalFields?.[1][0]).toEqual({
                fieldId: 'applications',
            });
        },
    );

    it('moves the row-axis heading up to the last dimension row', () => {
        const rows = getVisiblePivotHeaderRows(
            {
                ...data,
                titleFields: [
                    [{ fieldId: 'sale_date', direction: 'header' }],
                    [{ fieldId: 'region', direction: 'index' }],
                ],
            },
            { hideMetricNames: true },
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].titleFields).toEqual([
            { fieldId: 'region', direction: 'index' },
        ]);
    });

    it('hides every pivoted dimension name when several dimensions are pivoted', () => {
        const regionValue = {
            type: 'value' as const,
            fieldId: 'region',
            value: { raw: 'West', formatted: 'West' },
            colSpan: 1,
        };
        const rows = getVisiblePivotHeaderRows(
            {
                headerValueTypes: [
                    { type: FieldType.DIMENSION, fieldId: 'sale_date' },
                    { type: FieldType.DIMENSION, fieldId: 'region' },
                    { type: FieldType.METRIC },
                ],
                headerValues: [
                    data.headerValues[0],
                    [regionValue, regionValue],
                    data.headerValues[1],
                ],
                titleFields: [
                    [{ fieldId: 'sale_date', direction: 'header' }],
                    [{ fieldId: 'region', direction: 'header' }],
                    [{ fieldId: 'customer', direction: 'index' }],
                ],
                rowTotalFields: undefined,
            },
            { hideMetricNames: true },
        );
        expect(rows.map((row) => row.index)).toEqual([0, 1]);
        expect(rows[0].titleFields).toEqual([null]);
        expect(rows[1].titleFields).toEqual([
            { fieldId: 'customer', direction: 'index' },
        ]);
        expect(rows[1].values).toEqual([regionValue, regionValue]);
    });

    it('keeps the header when the metric row is the only row', () => {
        const metricsOnly = {
            ...data,
            headerValueTypes: [{ type: FieldType.METRIC as const }],
            headerValues: [data.headerValues[1]],
            titleFields: [[{ fieldId: 'region', direction: 'index' as const }]],
            rowTotalFields: undefined,
        };
        const rows = getVisiblePivotHeaderRows(metricsOnly, {
            hideMetricNames: true,
        });
        expect(rows.map((row) => row.values)).toEqual(metricsOnly.headerValues);
        expect(rows.map((row) => row.titleFields)).toEqual(
            metricsOnly.titleFields,
        );
    });

    it('leaves the headers alone with metrics as rows', () => {
        const metricsAsRows = {
            headerValueTypes: [
                { type: FieldType.DIMENSION as const, fieldId: 'sale_date' },
            ],
            headerValues: [data.headerValues[0]],
            titleFields: [
                [{ fieldId: 'sale_date', direction: 'header' as const }],
            ],
            rowTotalFields: undefined,
        };
        const rows = getVisiblePivotHeaderRows(metricsAsRows, {
            hideMetricNames: true,
        });
        expect(rows.map((row) => row.titleFields)).toEqual(
            metricsAsRows.titleFields,
        );
    });

    it.each([{}, { hideMetricNames: false }])(
        'keeps existing headers unchanged for %j',
        (config) => {
            const rows = getVisiblePivotHeaderRows(data, config);
            expect(rows.map((row) => row.values)).toEqual(data.headerValues);
            expect(rows.map((row) => row.titleFields)).toEqual(
                data.titleFields,
            );
            expect(rows.map((row) => row.rowTotalFields)).toEqual(
                data.rowTotalFields,
            );
        },
    );
});
