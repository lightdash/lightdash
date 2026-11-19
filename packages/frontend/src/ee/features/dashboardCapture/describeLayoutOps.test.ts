import { describe, expect, it } from 'vitest';
import { describeLayoutOps } from './describeLayoutOps';

const titles = new Map([
    ['a', 'Revenue'],
    ['b', 'Orders'],
]);

describe('describeLayoutOps', () => {
    it('describes each operation in plain words', () => {
        expect(
            describeLayoutOps(
                [
                    { type: 'swap', tileUuid: 'a', withTileUuid: 'b' },
                    { type: 'move', tileUuid: 'a', x: 0, y: 12 },
                    { type: 'resize', tileUuid: 'b', w: 36, h: 6 },
                ],
                titles,
            ),
        ).toBe(
            'swapped "Revenue" and "Orders"; moved "Revenue" to column 0, row 12; resized "Orders" to 36 columns by 6 rows',
        );
    });

    it('is empty when there are no operations', () => {
        expect(describeLayoutOps([], titles)).toBe('');
    });
});
