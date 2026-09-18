import {
    FieldType,
    Format,
    MetricType,
    type ItemsMap,
    type MergeFieldOrigins,
} from '@lightdash/common';
import { getMergeDefaultYAxisIndexByField } from './getMergeDefaultYAxisIndex';

const metric = (
    name: string,
    table: string,
    format?: Format,
): ItemsMap[string] => ({
    fieldType: FieldType.METRIC,
    type: MetricType.AVERAGE,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
    format,
});

const itemsMap: ItemsMap = {
    a_reviews_rating: metric('reviews_rating', 'a'),
    a_reviews_count: metric('reviews_count', 'a'),
    b_returns_refund_rate: metric('returns_refund_rate', 'b', Format.PERCENT),
    b_returns_count: metric('returns_count', 'b'),
};

const fieldOrigins: MergeFieldOrigins = {
    merge_join_key_0: {
        kind: 'joinKey',
        fieldIdBySourceId: { a: 'reviews_sku', b: 'returns_sku' },
    },
    a_reviews_rating: {
        kind: 'source',
        sourceId: 'a',
        sourceFieldId: 'reviews_rating',
    },
    a_reviews_count: {
        kind: 'source',
        sourceId: 'a',
        sourceFieldId: 'reviews_count',
    },
    b_returns_refund_rate: {
        kind: 'source',
        sourceId: 'b',
        sourceFieldId: 'returns_refund_rate',
    },
    b_returns_count: {
        kind: 'source',
        sourceId: 'b',
        sourceFieldId: 'returns_count',
    },
};

describe('getMergeDefaultYAxisIndexByField', () => {
    it('puts the second source on the right axis when formats differ', () => {
        expect(
            getMergeDefaultYAxisIndexByField({
                yFields: ['a_reviews_rating', 'b_returns_refund_rate'],
                itemsMap,
                fieldOrigins,
            }),
        ).toEqual({ a_reviews_rating: 0, b_returns_refund_rate: 1 });
    });

    it("keeps every field of a source on that source's axis", () => {
        expect(
            getMergeDefaultYAxisIndexByField({
                yFields: [
                    'a_reviews_rating',
                    'b_returns_refund_rate',
                    'a_reviews_count',
                    'b_returns_count',
                ],
                itemsMap,
                fieldOrigins,
            }),
        ).toEqual({
            a_reviews_rating: 0,
            a_reviews_count: 0,
            b_returns_refund_rate: 1,
            b_returns_count: 1,
        });
    });

    it('leaves two sources sharing a format on one axis', () => {
        expect(
            getMergeDefaultYAxisIndexByField({
                yFields: ['a_reviews_count', 'b_returns_count'],
                itemsMap,
                fieldOrigins,
            }),
        ).toEqual({});
    });

    it('leaves one source alone whatever its formats', () => {
        expect(
            getMergeDefaultYAxisIndexByField({
                yFields: ['b_returns_refund_rate', 'b_returns_count'],
                itemsMap,
                fieldOrigins,
            }),
        ).toEqual({});
    });

    it('does nothing outside a merge', () => {
        expect(
            getMergeDefaultYAxisIndexByField({
                yFields: ['a_reviews_rating', 'b_returns_refund_rate'],
                itemsMap,
                fieldOrigins: undefined,
            }),
        ).toEqual({});
    });
});
