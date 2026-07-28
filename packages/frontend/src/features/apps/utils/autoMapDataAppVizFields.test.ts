import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizField,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { autoMapDataAppVizFields } from './autoMapDataAppVizFields';

const dimension = (name: string, hidden = false): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const metric = (name: string, hidden = false): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden,
});

const itemsMap = (...items: (CompiledDimension | CompiledMetric)[]): ItemsMap =>
    Object.fromEntries(items.map((i) => [`orders_${i.name}`, i])) as ItemsMap;

const field = (
    name: string,
    type: DataAppVizField['type'],
    required = true,
): DataAppVizField => ({ name, label: name, type, required });

describe('autoMapDataAppVizFields', () => {
    it('binds nothing when the contract declares no slots', () => {
        expect(
            autoMapDataAppVizFields([], itemsMap(dimension('status'))),
        ).toEqual({});
    });

    it('binds nothing when the query has no columns', () => {
        expect(
            autoMapDataAppVizFields([field('x', 'dimension')], {} as ItemsMap),
        ).toEqual({});
    });

    it('binds each slot to a column of its type', () => {
        const mapping = autoMapDataAppVizFields(
            [field('category', 'dimension'), field('value', 'metric')],
            itemsMap(dimension('status'), metric('count')),
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
        });
    });

    it('binds a series slot to a dimension, not a metric', () => {
        const mapping = autoMapDataAppVizFields(
            [field('breakdown', 'series')],
            itemsMap(dimension('status'), metric('count')),
        );
        expect(mapping).toEqual({ breakdown: 'orders_status' });
    });

    it('never binds the same column to two slots', () => {
        const mapping = autoMapDataAppVizFields(
            [field('category', 'dimension'), field('breakdown', 'series')],
            itemsMap(dimension('status'), dimension('method')),
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            breakdown: 'orders_method',
        });
    });

    it('leaves a slot unbound when its pool runs dry', () => {
        const mapping = autoMapDataAppVizFields(
            [field('category', 'dimension'), field('breakdown', 'series')],
            itemsMap(dimension('status')),
        );
        expect(mapping).toEqual({ category: 'orders_status' });
        expect(mapping.breakdown).toBeUndefined();
    });

    it('fills required slots before optional ones', () => {
        // The optional slot is declared first, but the single dimension has to
        // land on the required one or the viz cannot render at all.
        const mapping = autoMapDataAppVizFields(
            [
                field('breakdown', 'series', false),
                field('category', 'dimension', true),
            ],
            itemsMap(dimension('status')),
        );
        expect(mapping).toEqual({ category: 'orders_status' });
    });

    it('keeps declared order within the required pass', () => {
        const mapping = autoMapDataAppVizFields(
            [field('first', 'dimension'), field('second', 'dimension')],
            itemsMap(dimension('status'), dimension('method')),
        );
        expect(mapping).toEqual({
            first: 'orders_status',
            second: 'orders_method',
        });
    });

    it('skips hidden columns', () => {
        const mapping = autoMapDataAppVizFields(
            [field('category', 'dimension'), field('value', 'metric')],
            itemsMap(
                dimension('secret', true),
                dimension('status'),
                metric('hidden_count', true),
                metric('count'),
            ),
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
        });
    });
});
