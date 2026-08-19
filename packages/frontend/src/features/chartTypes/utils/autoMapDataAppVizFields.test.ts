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
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from './autoMapDataAppVizFields';

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

describe('reconcileDataAppVizFieldMapping', () => {
    it('keeps a binding that is still valid', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension'), field('value', 'metric')],
            itemsMap(dimension('status'), dimension('method'), metric('count')),
            { category: 'orders_method', value: 'orders_count' },
        );
        expect(mapping).toEqual({
            category: 'orders_method',
            value: 'orders_count',
        });
    });

    it('drops a binding for a slot the contract no longer declares', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension')],
            itemsMap(dimension('status')),
            { category: 'orders_status', departed: 'orders_status' },
        );
        expect(mapping).toEqual({ category: 'orders_status' });
        expect(mapping.departed).toBeUndefined();
    });

    it('rebinds a required slot whose column left the query', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension')],
            itemsMap(dimension('method')),
            { category: 'orders_gone' },
        );
        expect(mapping).toEqual({ category: 'orders_method' });
    });

    it('rebinds a required slot that was retyped by a rebuild', () => {
        // The slot used to be a dimension and the saved mapping still points
        // at one; the rebuilt contract declares it a metric.
        const mapping = reconcileDataAppVizFieldMapping(
            [field('value', 'metric')],
            itemsMap(dimension('status'), metric('count')),
            { value: 'orders_status' },
        );
        expect(mapping).toEqual({ value: 'orders_count' });
    });

    it('fills a required slot a rebuild has newly added', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension'), field('value', 'metric')],
            itemsMap(dimension('status'), metric('count')),
            { category: 'orders_status' },
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
        });
    });

    it('leaves a cleared optional slot cleared', () => {
        // Refilling here would undo the user's clear on every render.
        const mapping = reconcileDataAppVizFieldMapping(
            [
                field('category', 'dimension'),
                field('breakdown', 'series', false),
            ],
            itemsMap(dimension('status'), dimension('method')),
            { category: 'orders_status' },
        );
        expect(mapping).toEqual({ category: 'orders_status' });
        expect(mapping.breakdown).toBeUndefined();
    });

    it('never rebinds a required slot onto a column another slot holds', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension'), field('breakdown', 'series')],
            itemsMap(dimension('status')),
            { category: 'orders_status' },
        );
        expect(mapping).toEqual({ category: 'orders_status' });
        expect(mapping.breakdown).toBeUndefined();
    });

    it('keeps two slots pointed at one column', () => {
        // Only auto-binding spreads columns; which ones a chart uses is the
        // user's call, and rebinding here would undo the pick they just made.
        const mapping = reconcileDataAppVizFieldMapping(
            [field('category', 'dimension'), field('breakdown', 'series')],
            itemsMap(dimension('status'), dimension('method')),
            { category: 'orders_status', breakdown: 'orders_status' },
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            breakdown: 'orders_status',
        });
    });

    it('does not hand a doubled-up column to a slot still waiting to be filled', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [
                field('category', 'dimension'),
                field('breakdown', 'series'),
                field('detail', 'dimension'),
            ],
            itemsMap(dimension('status'), dimension('method')),
            { category: 'orders_status', breakdown: 'orders_status' },
        );
        expect(mapping).toEqual({
            category: 'orders_status',
            breakdown: 'orders_status',
            detail: 'orders_method',
        });
    });

    it('matches a fresh auto-map when nothing is persisted and all slots are required', () => {
        const fields = [
            field('category', 'dimension'),
            field('value', 'metric'),
        ];
        const items = itemsMap(dimension('status'), metric('count'));
        expect(reconcileDataAppVizFieldMapping(fields, items, {})).toEqual(
            autoMapDataAppVizFields(fields, items),
        );
    });
});
