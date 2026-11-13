import { interleaveSubtotalRows } from './subtotalExport';

const detail = (
    store: string,
    category: string,
    product: string,
    n: number,
) => ({
    store,
    category,
    product,
    revenue: n,
});

describe('interleaveSubtotalRows', () => {
    const levels = [
        {
            dimensions: ['store'],
            rows: [
                { store: 'A', revenue: 60 },
                { store: 'B', revenue: 5 },
            ],
        },
        {
            dimensions: ['store', 'category'],
            rows: [
                { store: 'A', category: 'x', revenue: 30 },
                { store: 'A', category: 'y', revenue: 30 },
                { store: 'B', category: 'x', revenue: 5 },
            ],
        },
    ];

    it('puts each subtotal row above the rows of its group', () => {
        const result = interleaveSubtotalRows(
            [
                detail('A', 'x', 'p1', 10),
                detail('A', 'x', 'p2', 20),
                detail('A', 'y', 'p3', 30),
                detail('B', 'x', 'p1', 5),
            ],
            levels,
        );

        expect(result).toEqual([
            { kind: 'subtotal', depth: 0, row: { store: 'A', revenue: 60 } },
            {
                kind: 'subtotal',
                depth: 1,
                row: { store: 'A', category: 'x', revenue: 30 },
            },
            { kind: 'detail', depth: 2, row: detail('A', 'x', 'p1', 10) },
            { kind: 'detail', depth: 2, row: detail('A', 'x', 'p2', 20) },
            {
                kind: 'subtotal',
                depth: 1,
                row: { store: 'A', category: 'y', revenue: 30 },
            },
            { kind: 'detail', depth: 2, row: detail('A', 'y', 'p3', 30) },
            { kind: 'subtotal', depth: 0, row: { store: 'B', revenue: 5 } },
            {
                kind: 'subtotal',
                depth: 1,
                row: { store: 'B', category: 'x', revenue: 5 },
            },
            { kind: 'detail', depth: 2, row: detail('B', 'x', 'p1', 5) },
        ]);
    });

    it('gathers a group whose rows are split by the sort order', () => {
        const result = interleaveSubtotalRows(
            [
                detail('A', 'x', 'p1', 10),
                detail('B', 'x', 'p1', 5),
                detail('A', 'x', 'p2', 20),
            ],
            [levels[0]],
        );

        expect(result.map(({ kind, row }) => [kind, row.store])).toEqual([
            ['subtotal', 'A'],
            ['detail', 'A'],
            ['detail', 'A'],
            ['subtotal', 'B'],
            ['detail', 'B'],
        ]);
    });

    it('matches date values that are serialized differently', () => {
        const result = interleaveSubtotalRows(
            [{ day: '2024-01-01T00:00:00Z', product: 'p1', revenue: 10 }],
            [
                {
                    dimensions: ['day'],
                    rows: [{ day: '2024-01-01T00:00:00.000Z', revenue: 10 }],
                },
            ],
        );

        expect(result[0]).toEqual({
            kind: 'subtotal',
            depth: 0,
            row: { day: '2024-01-01T00:00:00Z', revenue: 10 },
        });
    });

    it('keeps the group row without values when its subtotal is missing', () => {
        const result = interleaveSubtotalRows(
            [detail('C', 'x', 'p1', 1)],
            [levels[0]],
        );

        expect(result[0]).toEqual({
            kind: 'subtotal',
            depth: 0,
            row: { store: 'C' },
        });
    });

    it('returns the detail rows untouched when there are no levels', () => {
        const rows = [detail('A', 'x', 'p1', 10)];
        expect(interleaveSubtotalRows(rows, [])).toEqual([
            { kind: 'detail', depth: 0, row: rows[0] },
        ]);
    });
});
