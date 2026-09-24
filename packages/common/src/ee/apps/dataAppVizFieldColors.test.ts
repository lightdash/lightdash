import { describe, expect, it } from 'vitest';
import { type DataAppVizFieldColorValues } from '../../types/savedCharts';
import {
    getEffectiveDataAppVizFieldColorValues,
    pruneDataAppVizFieldColorValues,
    resolveDataAppVizFieldColors,
} from './dataAppVizFieldColors';
import { type DataAppVizField } from './types';

const fields: DataAppVizField[] = [
    {
        name: 'values',
        label: 'Values',
        type: 'metric',
        required: true,
        multiple: true,
        colorOptions: {
            gradient: {
                enabled: true,
                start: '#000000',
                end: '#ffffff',
                min: 'auto',
                max: 'auto',
            },
        },
    },
];

const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });

describe('data app viz field colors', () => {
    it('preserves settings by bound field ID through reorder and prunes removed IDs', () => {
        const override: DataAppVizFieldColorValues = {
            values: {
                b: {
                    gradient: {
                        enabled: true,
                        start: '#ff0000',
                        end: '#00ff00',
                        min: 0,
                        max: 10,
                    },
                },
                gone: {
                    gradient: {
                        enabled: true,
                        start: '#000000',
                        end: '#ffffff',
                        min: 'auto',
                        max: 'auto',
                    },
                },
            },
        };
        expect(
            getEffectiveDataAppVizFieldColorValues(
                fields,
                { values: ['b', 'a'] },
                override,
            ).values.b.gradient?.start,
        ).toBe('#ff0000');
        expect(
            getEffectiveDataAppVizFieldColorValues(
                fields,
                { values: ['b', 'a'] },
                override,
            ).values.a.gradient?.start,
        ).toBe('#000000');
        expect(
            pruneDataAppVizFieldColorValues(
                fields,
                { values: ['b', 'a'] },
                override,
            ),
        ).toEqual({ values: { b: override.values.b } });
        expect(
            pruneDataAppVizFieldColorValues(fields, { values: '' }, override),
        ).toEqual({});
    });

    it('uses finite raw numeric values for auto bounds and canonical numeric keys', () => {
        const result = resolveDataAppVizFieldColors({
            fields,
            fieldMapping: { values: 'a' },
            rows: [
                { a: cell(0) },
                { a: cell(' 5 ') },
                { a: cell(10) },
                { a: cell('5oops') },
                { a: cell(null) },
                { a: cell(Infinity) },
            ],
            pivotDetails: null,
        });
        expect(result).toEqual({
            values: { a: { '0': '#000', '5': '#808080', '10': '#fff' } },
        });
    });

    it('reads original bound metrics from generated pivot columns', () => {
        const result = resolveDataAppVizFieldColors({
            fields,
            fieldMapping: { values: 'orders_total' },
            rows: [
                { pivot_a: cell(1), pivot_b: cell(3) },
                { pivot_a: cell(2), pivot_b: cell(4) },
            ],
            pivotDetails: {
                valuesColumns: [
                    {
                        referenceField: 'orders_total',
                        pivotColumnName: 'pivot_a',
                    },
                    {
                        referenceField: 'orders_total',
                        pivotColumnName: 'pivot_b',
                    },
                ],
            } as never,
        });
        expect(result.values.orders_total['1']).toBe('#000');
        expect(result.values.orders_total['4']).toBe('#fff');
    });

    it('resolves numeric series values carried in pivot metadata', () => {
        const result = resolveDataAppVizFieldColors({
            fields: [{ ...fields[0], type: 'dimension' }],
            fieldMapping: { values: 'orders_year' },
            rows: [{ pivot_a: cell(100), pivot_b: cell(200) }],
            pivotDetails: {
                valuesColumns: [
                    {
                        referenceField: 'orders_total',
                        pivotColumnName: 'pivot_a',
                        pivotValues: [
                            { referenceField: 'orders_year', value: 2020 },
                        ],
                    },
                    {
                        referenceField: 'orders_total',
                        pivotColumnName: 'pivot_b',
                        pivotValues: [
                            { referenceField: 'orders_year', value: 2022 },
                        ],
                    },
                ],
            } as never,
        });
        expect(result).toEqual({
            values: { orders_year: { '2020': '#000', '2022': '#fff' } },
        });
    });

    it('honors custom bounds, equal bounds, disabled and invalid gradients', () => {
        const colors = resolveDataAppVizFieldColors({
            fields,
            fieldMapping: { values: 'a' },
            fieldColorValues: {
                values: {
                    a: {
                        gradient: {
                            enabled: true,
                            start: '#000000',
                            end: '#ffffff',
                            min: 5,
                            max: 5,
                        },
                    },
                },
            },
            rows: [{ a: cell(0) }, { a: cell(5) }, { a: cell(10) }],
            pivotDetails: null,
        });
        expect(colors).toEqual({ values: { a: { '5': '#fff' } } });
        expect(
            resolveDataAppVizFieldColors({
                fields,
                fieldMapping: { values: 'a' },
                fieldColorValues: {
                    values: {
                        a: {
                            gradient: {
                                enabled: false,
                                start: '#000000',
                                end: '#ffffff',
                                min: 'auto',
                                max: 'auto',
                            },
                        },
                    },
                },
                rows: [{ a: cell(5) }],
                pivotDetails: null,
            }),
        ).toEqual({});
        expect(
            resolveDataAppVizFieldColors({
                fields,
                fieldMapping: { values: 'a' },
                fieldColorValues: {
                    values: {
                        a: {
                            gradient: {
                                enabled: true,
                                start: '#000000',
                                end: '#ffffff',
                                min: 10,
                                max: 0,
                            },
                        },
                    },
                },
                rows: [{ a: cell(5) }],
                pivotDetails: null,
            }),
        ).toEqual({});
        expect(
            pruneDataAppVizFieldColorValues(
                fields,
                { values: 'a' },
                {
                    values: {
                        a: {
                            gradient: {
                                enabled: true,
                                start: 'red',
                                end: '#ffffff',
                                min: 'auto',
                                max: 'auto',
                            },
                        },
                    },
                },
            ),
        ).toEqual({});
    });
});
