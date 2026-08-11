import { FieldType, MetricType, type ItemsMap } from '../types/field';
import { getItemId } from './item';
import {
    buildMergeItems,
    slugifyPivotValue,
    type MergeItemEntry,
} from './mergeQueryItems';

const metric = (overrides: Partial<ItemsMap[string]> = {}): ItemsMap[string] =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT_DISTINCT,
        name: 'followers_count',
        label: 'New followers',
        table: 'a',
        tableLabel: 'Query A',
        sql: '',
        hidden: false,
        ...overrides,
    }) as ItemsMap[string];

const entry = (overrides: Partial<MergeItemEntry> = {}): MergeItemEntry => ({
    column: 'c0_0',
    item: metric(),
    origin: {
        kind: 'source',
        sourceId: 'a',
        sourceFieldId: 'followers_count',
        pivotValue: null,
    },
    ...overrides,
});

describe('buildMergeItems', () => {
    it('keys every field by its item id, not by its column', () => {
        const { itemsMap } = buildMergeItems([entry()]);

        expect(Object.keys(itemsMap)).toEqual(['a_followers_count']);
    });

    it('keys by exactly what getItemId returns, so viz lookups resolve', () => {
        const { itemsMap } = buildMergeItems([entry()]);

        Object.entries(itemsMap).forEach(([fieldId, item]) => {
            expect(getItemId(item)).toEqual(fieldId);
        });
    });

    it('maps each warehouse column to the field it carries', () => {
        const { fieldIdByColumn } = buildMergeItems([entry()]);

        expect(fieldIdByColumn).toEqual({ c0_0: 'a_followers_count' });
    });

    it('records provenance beside the fields rather than on them', () => {
        const { itemsMap, fieldOrigins } = buildMergeItems([entry()]);

        expect(fieldOrigins.a_followers_count).toEqual({
            kind: 'source',
            sourceId: 'a',
            sourceFieldId: 'followers_count',
            pivotValue: null,
        });
        expect(itemsMap.a_followers_count).not.toHaveProperty('sourceId');
    });

    it('keeps two sources of the same field apart', () => {
        const { itemsMap } = buildMergeItems([
            entry(),
            entry({
                column: 'c1_0',
                item: metric({ table: 'b', tableLabel: 'Query B' }),
            }),
        ]);

        expect(Object.keys(itemsMap)).toEqual([
            'a_followers_count',
            'b_followers_count',
        ]);
    });

    it('refuses to let one column silently replace another', () => {
        expect(() =>
            buildMergeItems([entry(), entry({ column: 'c0_1' })]),
        ).toThrow(/resolve to the field id/);
    });
});

describe('slugifyPivotValue', () => {
    it('does not encode the value position, so editing the pivot list is safe', () => {
        expect(slugifyPivotValue('Organic')).toEqual('organic');
        expect(slugifyPivotValue('paid search')).toEqual('paid_search');
    });

    it('names a value that slugs to nothing', () => {
        expect(slugifyPivotValue('—')).toEqual('null');
    });
});
