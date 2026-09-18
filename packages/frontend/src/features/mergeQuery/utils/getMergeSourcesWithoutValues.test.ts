import { type MergeFieldOrigins, type ResultRow } from '@lightdash/common';
import { getMergeSourcesWithoutValues } from './getMergeSourcesWithoutValues';

const fieldOrigins: MergeFieldOrigins = {
    merge_join_key_0: {
        kind: 'joinKey',
        fieldIdBySourceId: { a: 'orders_month', b: 'orders_month' },
    },
    a_orders_total: { kind: 'source', sourceId: 'a', sourceFieldId: 'total' },
    b_payments_count: {
        kind: 'source',
        sourceId: 'b',
        sourceFieldId: 'count',
    },
    ratio: { kind: 'tableCalculation' },
};

const row = (total: number | null, count: number | null): ResultRow => ({
    merge_join_key_0: { value: { raw: '2026-01-01', formatted: 'Jan' } },
    a_orders_total: { value: { raw: total, formatted: String(total) } },
    b_payments_count: { value: { raw: count, formatted: String(count) } },
});

describe('getMergeSourcesWithoutValues', () => {
    it('names the source whose columns are blank on every row', () => {
        expect(
            getMergeSourcesWithoutValues({
                rows: [row(10, null), row(20, null)],
                fieldOrigins,
                complete: true,
            }),
        ).toEqual(['b']);
    });

    it('names nothing when each source has a value somewhere', () => {
        expect(
            getMergeSourcesWithoutValues({
                rows: [row(10, null), row(null, 3)],
                fieldOrigins,
                complete: true,
            }),
        ).toEqual([]);
    });

    it('does not judge a partial result or an empty one', () => {
        expect(
            getMergeSourcesWithoutValues({
                rows: [row(10, null)],
                fieldOrigins,
                complete: false,
            }),
        ).toEqual([]);
        expect(
            getMergeSourcesWithoutValues({
                rows: [],
                fieldOrigins,
                complete: true,
            }),
        ).toEqual([]);
    });
});
