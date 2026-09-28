import {
    ChartType,
    type ChartConfig,
    type DataAppVizSchema,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildVizSubtotalRequest } from './vizSubtotals';
import { getVizSubtotalDimensions } from './vizSubtotals';

describe('buildVizSubtotalRequest', () => {
    const dimensions = ['orders_country', 'orders_city', 'orders_store'];

    it('requests only the root grouping before any expansion', () => {
        expect(
            buildVizSubtotalRequest(dimensions, { level: 0, parentValues: [] }),
        ).toEqual({ subtotalDimensions: ['orders_country'], parent: [] });
    });

    it('scopes children to the entire parent path, preserving nulls', () => {
        expect(
            buildVizSubtotalRequest(dimensions, {
                level: 2,
                parentValues: ['Portugal', null],
            }),
        ).toEqual({
            subtotalDimensions: ['orders_store'],
            parent: [
                { dimensionId: 'orders_country', value: 'Portugal' },
                { dimensionId: 'orders_city', value: null },
            ],
        });
    });

    it.each([
        null,
        { level: -1, parentValues: [] },
        { level: 1.5, parentValues: ['Portugal'] },
        { level: 3, parentValues: ['Portugal', 'Lisbon', 'A'] },
        { level: 1, parentValues: [] },
        { level: 1, parentValues: [{ sql: 'select 1' }] },
        { level: 1, parentValues: [Number.NaN] },
        { level: 0, parentValues: [], subtotalDimensions: ['secret'] },
    ])('rejects malformed or field-overriding intent %j', (intent) => {
        expect(() => buildVizSubtotalRequest(dimensions, intent)).toThrow();
    });
});

describe('getVizSubtotalDimensions', () => {
    const chartConfig: ChartConfig = {
        type: ChartType.DATA_APP_VIZ,
        config: {
            dataAppVizUuid: 'viz-1',
            fieldMapping: { path: ['orders_country', 'orders_city'] },
        },
    };
    const schema: DataAppVizSchema = {
        fields: [
            {
                name: 'path',
                label: 'Path',
                type: 'dimension',
                required: true,
                multiple: true,
            },
        ],
        configOptions: [],
        colorPalette: null,
        hierarchy: { field: 'path' },
    };

    it('uses the ordered mapped dimensions of an opted-in type', () => {
        expect(getVizSubtotalDimensions(chartConfig, schema)).toEqual([
            'orders_country',
            'orders_city',
        ]);
    });

    it('rejects undeclared, non-multiple, and non-dimension hierarchy slots', () => {
        expect(
            getVizSubtotalDimensions(chartConfig, {
                ...schema,
                fields: [],
            }),
        ).toBeNull();
        expect(
            getVizSubtotalDimensions(chartConfig, {
                ...schema,
                fields: [{ ...schema.fields[0], multiple: false }],
            }),
        ).toBeNull();
        expect(
            getVizSubtotalDimensions(chartConfig, {
                ...schema,
                fields: [{ ...schema.fields[0], type: 'metric' }],
            }),
        ).toBeNull();
    });

    it.each([
        { path: [] },
        { path: ['orders_country', ''] },
        { path: ['orders_country', 'orders_country'] },
        { path: ['orders_country', 5] },
    ])('rejects an invalid mapped dimension path $path', ({ path }) => {
        expect(
            getVizSubtotalDimensions(
                {
                    ...chartConfig,
                    config: {
                        ...chartConfig.config,
                        fieldMapping: { path },
                    },
                } as ChartConfig,
                schema,
            ),
        ).toBeNull();
    });

    it('keeps ordinary and legacy charts on detail queries', () => {
        expect(
            getVizSubtotalDimensions(chartConfig, {
                ...schema,
                hierarchy: undefined,
            }),
        ).toBeNull();
        expect(
            getVizSubtotalDimensions({ type: ChartType.TABLE }, schema),
        ).toBeNull();
    });
});
