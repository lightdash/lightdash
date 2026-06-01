import { FieldType } from '@lightdash/common';
import type { PivotData } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getGroupedDimColumnIds, getRowSpanMerges } from './getRowSpanMerges';

// Builds a getRawValue reader over an array of plain row objects.
const reader =
    (rows: Record<string, unknown>[]) => (rowIndex: number, columnId: string) =>
        rows[rowIndex]?.[columnId];

describe('getGroupedDimColumnIds', () => {
    it('returns index dims in column order minus the leaf dim', () => {
        const indexValueTypes: PivotData['indexValueTypes'] = [
            { type: FieldType.DIMENSION, fieldId: 'month' },
            { type: FieldType.DIMENSION, fieldId: 'tier' },
        ];
        const columnOrder = ['month', 'tier', 'metric_a', 'metric_b'];
        expect(getGroupedDimColumnIds(indexValueTypes, columnOrder)).toEqual([
            'month',
        ]);
    });

    it('returns empty when there is only a single index dim', () => {
        const indexValueTypes: PivotData['indexValueTypes'] = [
            { type: FieldType.DIMENSION, fieldId: 'month' },
        ];
        expect(
            getGroupedDimColumnIds(indexValueTypes, ['month', 'metric_a']),
        ).toEqual([]);
    });

    it('returns empty when there are no index dims', () => {
        expect(
            getGroupedDimColumnIds([] as PivotData['indexValueTypes'], [
                'metric_a',
            ]),
        ).toEqual([]);
    });
});

describe('getRowSpanMerges', () => {
    it('merges consecutive equal values in a single column', () => {
        const rows = [
            { month: '2026-02' },
            { month: '2026-02' },
            { month: '2026-01' },
        ];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 2 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('does not merge non-adjacent equal values', () => {
        const rows = [{ month: 'A' }, { month: 'B' }, { month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('computes nested spans: outer dim spans wider than inner', () => {
        const rows = [
            { a: 'x', b: 'p' },
            { a: 'x', b: 'p' },
            { a: 'x', b: 'q' },
            { a: 'y', b: 'p' },
        ];
        const merges = getRowSpanMerges(rows.length, ['a', 'b'], reader(rows));
        expect(merges.get('a')).toEqual([
            { isBlockStart: true, rowSpan: 3 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 2 },
            { isBlockStart: false, rowSpan: 0 },
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('does not merge an inner value repeating under a different outer value', () => {
        const rows = [
            { a: 'x', b: 'p' },
            { a: 'y', b: 'p' },
        ];
        const merges = getRowSpanMerges(rows.length, ['a', 'b'], reader(rows));
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 1 },
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('handles a single row', () => {
        const rows = [{ month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 1 },
        ]);
    });

    it('returns an empty map when columnIds is empty', () => {
        const rows = [{ month: 'A' }];
        expect(getRowSpanMerges(rows.length, [], reader(rows)).size).toBe(0);
    });

    it('returns empty span arrays when rowCount is 0', () => {
        const merges = getRowSpanMerges(0, ['month'], reader([]));
        expect(merges.get('month')).toEqual([]);
    });
});
