import { type ResultRow } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    buildCustomVisualizationData,
    parseCustomVisualizationSpec,
    resolveCustomVisualizationConfig,
    serializeCustomVisualizationSpec,
} from './config';

const rows: ResultRow[] = [
    {
        orders_status: { value: { raw: 'shipped', formatted: 'Shipped' } },
        orders_count: { value: { raw: 12, formatted: '12' } },
    },
    {
        orders_status: { value: { raw: 'pending', formatted: 'Pending' } },
        orders_count: { value: { raw: 3, formatted: '3' } },
    },
];

describe('buildCustomVisualizationData', () => {
    test('keeps the raw values keyed by field id', () => {
        expect(buildCustomVisualizationData({ rows })).toEqual({
            series: [
                { orders_status: 'shipped', orders_count: 12 },
                { orders_status: 'pending', orders_count: 3 },
            ],
            fields: ['orders_status', 'orders_count'],
        });
    });

    test('is empty without rows', () => {
        expect(buildCustomVisualizationData(undefined)).toEqual({
            series: [],
            fields: [],
        });
        expect(buildCustomVisualizationData({ rows: [] })).toEqual({
            series: [],
            fields: [],
        });
    });
});

describe('spec serialisation', () => {
    test('round trips a spec through its JSON text', () => {
        const spec = { mark: 'bar', encoding: { x: { field: 'a' } } };
        const text = serializeCustomVisualizationSpec(spec);
        expect(text).toBe(JSON.stringify(spec, null, 2));
        expect(parseCustomVisualizationSpec(text!)).toEqual(spec);
    });

    test('parses invalid JSON as undefined', () => {
        expect(parseCustomVisualizationSpec('{ mark:')).toBeUndefined();
    });
});

describe('resolveCustomVisualizationConfig', () => {
    test('keeps what JSON keeps of the spec', () => {
        expect(
            resolveCustomVisualizationConfig({
                chartConfig: { spec: { mark: 'bar', skipped: undefined } },
            }),
        ).toEqual({ spec: { mark: 'bar' } });
    });

    test('has no spec without a config', () => {
        expect(
            resolveCustomVisualizationConfig({ chartConfig: undefined }),
        ).toEqual({ spec: undefined });
    });
});
