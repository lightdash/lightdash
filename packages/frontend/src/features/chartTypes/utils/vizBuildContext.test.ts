import { describe, expect, it } from 'vitest';
import { normalizeVizBuildContext } from './vizBuildContext';

describe('normalizeVizBuildContext', () => {
    it('keeps chart context but excludes sample data without consent', () => {
        expect(
            normalizeVizBuildContext(
                {
                    fieldMapping: { value: 'orders_total' },
                    elementReferences: ['selected label'],
                    sampleRows: [{ orders_total: 'sensitive' }],
                },
                false,
            ),
        ).toEqual({
            fieldMapping: { value: 'orders_total' },
            elementReferences: ['selected label'],
        });
    });

    it('bounds shared sample data and element references without changing the source', () => {
        const row = Object.fromEntries(
            Array.from({ length: 25 }, (_, i) => [
                `field_${i}`,
                'x'.repeat(600),
            ]),
        );
        const rows = Array.from({ length: 12 }, () => row);
        const context = normalizeVizBuildContext(
            { sampleRows: rows, elementReferences: Array(8).fill('element') },
            true,
        );

        expect(context?.sampleRows).toHaveLength(10);
        expect(Object.keys(context!.sampleRows![0])).toHaveLength(20);
        expect(context?.sampleRows?.[0].field_0).toHaveLength(500);
        expect(context?.elementReferences).toHaveLength(5);
        expect(row.field_0).toHaveLength(600);
        expect(rows).toHaveLength(12);
    });

    it('omits empty context', () => {
        expect(normalizeVizBuildContext(undefined, false)).toBeUndefined();
        expect(
            normalizeVizBuildContext(
                { sampleRows: [], elementReferences: [] },
                true,
            ),
        ).toBeUndefined();
    });
});
