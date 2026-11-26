import { FieldType } from '@lightdash/common';
import type { PivotData } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getGroupedDimColumnIds,
    getMergedValueLineClamp,
    getRowSpanMerges,
    getWindowedRowSpanMerge,
    TABLE_LINE_HEIGHT_PX,
} from './getRowSpanMerges';

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

    it('does not treat pivot row metrics as grouping dimensions', () => {
        const indexValueTypes: PivotData['indexValueTypes'] = [
            { type: FieldType.DIMENSION, fieldId: 'month' },
            { type: FieldType.METRIC, fieldId: 'cohort_size' },
            { type: FieldType.DIMENSION, fieldId: 'tier' },
        ];

        expect(
            getGroupedDimColumnIds(indexValueTypes, [
                'month',
                'cohort_size',
                'tier',
            ]),
        ).toEqual(['month']);
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
            { isBlockStart: true, rowSpan: 2, blockStartRow: 0 },
            { isBlockStart: false, rowSpan: 0, blockStartRow: 0 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 2 },
        ]);
    });

    it('does not merge non-adjacent equal values', () => {
        const rows = [{ month: 'A' }, { month: 'B' }, { month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 1, blockStartRow: 0 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 1 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 2 },
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
            { isBlockStart: true, rowSpan: 3, blockStartRow: 0 },
            { isBlockStart: false, rowSpan: 0, blockStartRow: 0 },
            { isBlockStart: false, rowSpan: 0, blockStartRow: 0 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 3 },
        ]);
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 2, blockStartRow: 0 },
            { isBlockStart: false, rowSpan: 0, blockStartRow: 0 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 2 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 3 },
        ]);
    });

    it('does not merge an inner value repeating under a different outer value', () => {
        const rows = [
            { a: 'x', b: 'p' },
            { a: 'y', b: 'p' },
        ];
        const merges = getRowSpanMerges(rows.length, ['a', 'b'], reader(rows));
        expect(merges.get('b')).toEqual([
            { isBlockStart: true, rowSpan: 1, blockStartRow: 0 },
            { isBlockStart: true, rowSpan: 1, blockStartRow: 1 },
        ]);
    });

    it('handles a single row', () => {
        const rows = [{ month: 'A' }];
        const merges = getRowSpanMerges(rows.length, ['month'], reader(rows));
        expect(merges.get('month')).toEqual([
            { isBlockStart: true, rowSpan: 1, blockStartRow: 0 },
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

describe('getWindowedRowSpanMerge', () => {
    // Rows 0-4 are block A, rows 5-6 are block B.
    const rows = [
        ...Array.from({ length: 5 }, () => ({ month: 'A' })),
        { month: 'B' },
        { month: 'B' },
    ];
    const spans = getRowSpanMerges(rows.length, ['month'], reader(rows)).get(
        'month',
    );

    it('keeps a block that fits inside the rendered rows', () => {
        expect(getWindowedRowSpanMerge(spans, 0, 0, 6)).toBe(spans![0]);
        expect(getWindowedRowSpanMerge(spans, 3, 0, 6)).toBe(spans![3]);
    });

    it('starts a block on the first rendered row when it began above it', () => {
        expect(getWindowedRowSpanMerge(spans, 2, 2, 6)).toEqual({
            isBlockStart: true,
            rowSpan: 3,
            blockStartRow: 0,
        });
        expect(getWindowedRowSpanMerge(spans, 3, 2, 6)).toBe(spans![3]);
    });

    it('stops a block at the last rendered row', () => {
        expect(getWindowedRowSpanMerge(spans, 0, 0, 2)).toEqual({
            isBlockStart: true,
            rowSpan: 3,
            blockStartRow: 0,
        });
        expect(getWindowedRowSpanMerge(spans, 5, 3, 5)).toEqual({
            isBlockStart: true,
            rowSpan: 1,
            blockStartRow: 5,
        });
    });

    it('clips both ends when the rendered rows sit inside one block', () => {
        expect(getWindowedRowSpanMerge(spans, 1, 1, 3)).toEqual({
            isBlockStart: true,
            rowSpan: 3,
            blockStartRow: 0,
        });
    });

    it('returns undefined for a column that is not merged', () => {
        expect(getWindowedRowSpanMerge(undefined, 0, 0, 6)).toBeUndefined();
    });
});

describe('getMergedValueLineClamp', () => {
    // The real line height of 13px table text.
    const LINE_HEIGHT_PX = 13 * 1.4286;
    const tables = [
        { name: 'results table', rowHeight: 34, paddingY: 8.5 },
        { name: 'pivot table', rowHeight: 32, paddingY: 8 },
    ];

    it('shows one line in a cell of one row', () => {
        tables.forEach(({ rowHeight, paddingY }) => {
            expect(getMergedValueLineClamp(1, rowHeight, paddingY)).toBe(1);
        });
    });

    it('shows three lines in two rows of the results table', () => {
        expect(getMergedValueLineClamp(2, 34, 8.5)).toBe(3);
    });

    it('shows three lines in two rows of the pivot table', () => {
        expect(getMergedValueLineClamp(2, 32, 8)).toBe(3);
    });

    it('never shows more lines than fit in the rows the cell covers', () => {
        tables.forEach(({ rowHeight, paddingY }) => {
            for (let rowSpan = 2; rowSpan <= 100; rowSpan += 1) {
                const lines = getMergedValueLineClamp(
                    rowSpan,
                    rowHeight,
                    paddingY,
                );
                expect(paddingY + lines * LINE_HEIGHT_PX).toBeLessThanOrEqual(
                    rowSpan * rowHeight,
                );
                expect(
                    paddingY + (lines + 1) * TABLE_LINE_HEIGHT_PX,
                ).toBeGreaterThanOrEqual(rowSpan * rowHeight);
            }
        });
    });
});
