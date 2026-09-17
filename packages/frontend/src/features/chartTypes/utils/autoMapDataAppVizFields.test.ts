import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizField,
    type DataAppVizSchema,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildTestMetricQuery,
    isMappingComplete,
} from '../components/dataAppVizTestQuery';
import {
    autoMapDataAppVizFields,
    getUnboundRequiredDataAppVizFields,
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

const funnelSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'step',
            label: 'Step',
            type: 'dimension',
            required: true,
            description: 'The label for each funnel stage.',
            examples: ['Listing started', 'Price entered'],
        },
        {
            name: 'count',
            label: 'Count',
            type: 'metric',
            required: true,
            description: 'The number that reached the stage.',
            examples: [120, 83],
        },
    ],
    configOptions: [],
    colorPalette: null,
    inputGuidance:
        'Use one row per stage in the intended order. Reshape separate metrics or boolean flags into stage/count rows before mapping.',
};

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

    it('binds a column slot to a metric when one is available', () => {
        const mapping = autoMapDataAppVizFields(
            [field('value', 'column')],
            itemsMap(dimension('status'), metric('count')),
        );
        expect(mapping).toEqual({ value: 'orders_count' });
    });

    it('binds a column slot to a dimension when no metric is free', () => {
        const mapping = autoMapDataAppVizFields(
            [field('value', 'metric'), field('anything', 'column')],
            itemsMap(dimension('status'), metric('count')),
        );
        expect(mapping).toEqual({
            value: 'orders_count',
            anything: 'orders_status',
        });
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

    it('reserves one column for every required slot before filling a multiple slot', () => {
        const mapping = autoMapDataAppVizFields(
            [
                { ...field('values', 'metric'), multiple: true },
                field('target', 'metric'),
            ],
            itemsMap(metric('first'), metric('second'), metric('third')),
        );

        expect(mapping).toEqual({
            values: ['orders_first', 'orders_third'],
            target: 'orders_second',
        });
    });

    it('fills remaining compatible columns for an optional multiple slot', () => {
        expect(
            autoMapDataAppVizFields(
                [{ ...field('values', 'metric', false), multiple: true }],
                itemsMap(metric('first'), metric('second'), metric('third')),
            ),
        ).toEqual({
            values: ['orders_first', 'orders_second', 'orders_third'],
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

    it('keeps a multiple binding ordered, unique, and unexpanded on reconcile', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [{ ...field('values', 'metric'), multiple: true }],
            itemsMap(metric('first'), metric('second'), metric('third')),
            {
                values: [
                    'orders_second',
                    'orders_missing',
                    'orders_first',
                    'orders_second',
                ],
            },
        );

        expect(mapping).toEqual({
            values: ['orders_second', 'orders_first'],
        });
    });

    it('preserves an explicit empty multiple binding through reconciliation', () => {
        const mapping = reconcileDataAppVizFieldMapping(
            [{ ...field('values', 'metric'), multiple: true }],
            itemsMap(metric('first')),
            { values: [] },
        );

        expect(mapping).toEqual({ values: [] });
        expect(
            getUnboundRequiredDataAppVizFields(
                [{ ...field('values', 'metric'), multiple: true }],
                mapping,
            ),
        ).toHaveLength(1);
    });

    it('converts a legacy scalar to a multiple binding and a multiple binding to its first scalar', () => {
        const items = itemsMap(metric('first'), metric('second'));
        expect(
            reconcileDataAppVizFieldMapping(
                [{ ...field('values', 'metric'), multiple: true }],
                items,
                { values: 'orders_second' },
            ),
        ).toEqual({ values: ['orders_second'] });
        expect(
            reconcileDataAppVizFieldMapping(
                [field('value', 'metric')],
                items,
                { value: ['orders_second', 'orders_first'] },
            ),
        ).toEqual({ value: 'orders_second' });
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

describe('getUnboundRequiredDataAppVizFields', () => {
    it('lists only required slots without a binding, in declared order', () => {
        const fields: DataAppVizField[] = [
            { name: 'x', label: 'X', type: 'dimension', required: true },
            { name: 'y', label: 'Y', type: 'metric', required: true },
            {
                name: 'series',
                label: 'Series',
                type: 'series',
                required: false,
            },
        ];

        expect(
            getUnboundRequiredDataAppVizFields(fields, { y: 'orders_count' }),
        ).toEqual([fields[0]]);
        expect(getUnboundRequiredDataAppVizFields(fields, {})).toEqual([
            fields[0],
            fields[1],
        ]);
    });
});

describe('representative funnel query shapes', () => {
    it('leaves Step unbound for separate stage measures and directs the required-field recovery', () => {
        const mapping = autoMapDataAppVizFields(
            funnelSchema.fields,
            itemsMap(metric('listing_started'), metric('price_entered')),
        );

        expect(mapping).toEqual({ count: 'orders_listing_started' });
        expect(isMappingComplete(funnelSchema, mapping)).toBe(false);
        expect(
            getUnboundRequiredDataAppVizFields(
                funnelSchema.fields,
                mapping,
            ).map((field) => field.label),
        ).toEqual(['Step']);
        expect(funnelSchema.inputGuidance).toContain(
            'Reshape separate metrics or boolean flags into stage/count rows',
        );
    });

    it('can map a boolean stage flag without claiming that the field has funnel semantics', () => {
        const booleanFlag = {
            ...dimension('reached_price'),
            type: DimensionType.BOOLEAN,
        };
        const mapping = autoMapDataAppVizFields(
            funnelSchema.fields,
            itemsMap(booleanFlag, metric('count')),
        );

        expect(mapping).toEqual({
            step: 'orders_reached_price',
            count: 'orders_count',
        });
        expect(isMappingComplete(funnelSchema, mapping)).toBe(true);
        expect(funnelSchema.inputGuidance).toContain('boolean flags');
    });

    it('maps a reshaped stage/count query and keeps the same help for different field ids', () => {
        const firstMapping = autoMapDataAppVizFields(
            funnelSchema.fields,
            itemsMap(dimension('stage'), metric('count')),
        );
        const reshapedMapping = autoMapDataAppVizFields(
            funnelSchema.fields,
            itemsMap(dimension('funnel_stage'), metric('funnel_count')),
        );

        expect(isMappingComplete(funnelSchema, reshapedMapping)).toBe(true);
        expect(
            getUnboundRequiredDataAppVizFields(
                funnelSchema.fields,
                reshapedMapping,
            ),
        ).toEqual([]);
        expect(
            buildTestMetricQuery('orders', funnelSchema, reshapedMapping),
        ).toMatchObject({
            dimensions: ['orders_funnel_stage'],
            metrics: ['orders_funnel_count'],
        });
        expect(firstMapping).toEqual({
            step: 'orders_stage',
            count: 'orders_count',
        });
        expect(funnelSchema.inputGuidance).toContain('one row per stage');
    });
});
