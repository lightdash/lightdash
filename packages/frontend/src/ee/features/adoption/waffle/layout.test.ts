import { describe, expect, it } from 'vitest';
import {
    deepOrganization,
    flatOrganization,
} from '../map/organizationFixtures';
import { seededOrganization } from '../utils/adoptionFixtures';
import {
    allocate,
    BLOCK_GAP,
    BLOCK_HEADER_HEIGHT,
    BLOCK_PADDING,
    BOARD_PADDING,
    getSquareOffset,
    getSquaresGrid,
    layoutWaffle,
    MIN_BLOCK_WIDTH,
    MIN_PART_HEIGHT,
    PART_GAP,
    SQUARE_LIMIT,
    type WaffleLayoutInput,
} from './layout';
import { buildWaffleBlocks } from './waffleBlocks';

type InputBlock = WaffleLayoutInput['blocks'][number];

// A department without sub-departments: one part of all its people
const lone = (id: string, size: number): InputBlock => ({
    id,
    size,
    parts: [{ id: `own:${id}`, size, hasName: false }],
});

const toInput = (
    departments: Parameters<typeof buildWaffleBlocks>[0],
    width: number,
    height: number,
): WaffleLayoutInput => ({
    blocks: buildWaffleBlocks(departments).map((block) => ({
        id: block.departmentUuid,
        size: block.size,
        parts: block.parts.map((part) => ({
            id: part.id,
            size: part.size,
            hasName: part.name !== null,
        })),
    })),
    width,
    height,
});

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

const equal = (weights: number[], minimum: number) =>
    weights.map((weight) => ({ weight, minimum }));

describe('allocate', () => {
    it('shares the pixels by weight, in whole pixels that add up to the total', () => {
        expect(allocate(100, equal([1, 1, 2], 0))).toEqual([25, 25, 50]);
        const shares = allocate(101, equal([1, 1, 1], 0));
        expect(sum(shares)).toBe(101);
        shares.forEach((share) => expect([33, 34]).toContain(share));
    });

    it('holds a small item at its minimum and shares the rest by weight', () => {
        expect(allocate(400, equal([1000, 10, 1], 72))).toEqual([256, 72, 72]);
        expect(
            allocate(300, [
                { weight: 100, minimum: 10 },
                { weight: 1, minimum: 120 },
            ]),
        ).toEqual([180, 120]);
    });

    it('shares equally when nothing has a weight', () => {
        expect(allocate(90, equal([0, 0, 0], 10))).toEqual([30, 30, 30]);
    });

    it('shrinks every item in step with its minimum when the minimums alone do not fit', () => {
        expect(allocate(100, equal([5, 1, 1, 1, 1], 26))).toEqual([
            20, 20, 20, 20, 20,
        ]);
    });
});

describe('getSquaresGrid', () => {
    it('never draws a square larger than 10 px, however much room there is', () => {
        expect(getSquaresGrid(400, 400, 100)).toEqual({
            kind: 'squares',
            cell: 10,
            gap: 2,
            columns: 33,
        });
    });

    it('takes the side from the room each person has, and shrinks it until the rows fit with their gaps', () => {
        // floor(sqrt(200 × 100 / 300)) = 8, but 8 and 7 px rows with their gaps are taller than 100 px
        expect(getSquaresGrid(200, 100, 300)).toEqual({
            kind: 'squares',
            cell: 6,
            gap: 2,
            columns: 25,
        });
    });

    it('sets squares under 5 px 1 px apart', () => {
        expect(getSquaresGrid(40, 40, 100)).toEqual({
            kind: 'squares',
            cell: 3,
            gap: 1,
            columns: 10,
        });
    });

    it('draws one stacked bar when the squares would be under 3 px', () => {
        // floor(sqrt(20 × 20 / 100)) = 2
        expect(getSquaresGrid(20, 20, 100)).toEqual({ kind: 'bar' });
        // 3 px fits the area but not with the gaps
        expect(getSquaresGrid(30, 30, 100)).toEqual({ kind: 'bar' });
    });

    it('draws nothing for nobody', () => {
        expect(getSquaresGrid(100, 100, 0)).toEqual({ kind: 'empty' });
    });

    it('places squares left to right, then down', () => {
        const grid = { cell: 6, gap: 2, columns: 3 };
        expect(
            [0, 1, 2, 3, 7].map((position) => getSquareOffset(grid, position)),
        ).toEqual([
            { x: 0, y: 0 },
            { x: 8, y: 0 },
            { x: 16, y: 0 },
            { x: 0, y: 8 },
            { x: 8, y: 16 },
        ]);
    });
});

describe('layoutWaffle', () => {
    it('makes each block as wide as its share of the row, but never narrower than 72 px', () => {
        const { blocks } = layoutWaffle({
            blocks: [lone('a', 2350), lone('b', 1900), lone('c', 12)],
            width: 720,
            height: 560,
        });
        const [a, b, c] = blocks;
        expect(c.width).toBe(MIN_BLOCK_WIDTH);
        expect(a.width + b.width + c.width + 2 * BLOCK_GAP).toBe(
            720 - 2 * BOARD_PADDING,
        );
        expect(a.width / b.width).toBeCloseTo(2350 / 1900, 2);
        expect(blocks.map((block) => block.x)).toEqual([
            BOARD_PADDING,
            BOARD_PADDING + a.width + BLOCK_GAP,
            BOARD_PADDING + a.width + b.width + 2 * BLOCK_GAP,
        ]);
        blocks.forEach((block) => {
            expect(block.y).toBe(BOARD_PADDING);
            expect(block.height).toBe(560 - 2 * BOARD_PADDING);
        });
    });

    it('wraps the blocks to further rows once the minimum widths no longer fit, as evenly as the rows allow', () => {
        // 376 px holds four 72 px blocks and their gaps, not five, so six blocks take two rows of three
        const { blocks } = layoutWaffle({
            blocks: [100, 90, 80, 70, 60, 50].map((size, index) =>
                lone(`d${index}`, size),
            ),
            width: 400,
            height: 560,
        });
        const rows = [...new Set(blocks.map((block) => block.y))];
        expect(rows).toHaveLength(2);
        const firstRow = blocks.filter((block) => block.y === rows[0]);
        const secondRow = blocks.filter((block) => block.y === rows[1]);
        expect(firstRow.map((block) => block.id)).toEqual(['d0', 'd1', 'd2']);
        expect(secondRow.map((block) => block.id)).toEqual(['d3', 'd4', 'd5']);
        expect(secondRow[0].x).toBe(BOARD_PADDING);
        [firstRow, secondRow].forEach((row) =>
            expect(
                sum(row.map((block) => block.width)) +
                    BLOCK_GAP * (row.length - 1),
            ).toBe(400 - 2 * BOARD_PADDING),
        );
        // The rows share the height by their people
        expect(rows[1]).toBe(rows[0] + firstRow[0].height + BLOCK_GAP);
        expect(firstRow[0].height / secondRow[0].height).toBeCloseTo(
            270 / 180,
            1,
        );
        expect(firstRow[0].height + secondRow[0].height + BLOCK_GAP).toBe(
            560 - 2 * BOARD_PADDING,
        );
    });

    it('never leaves a small department alone across a whole row', () => {
        // Nine departments where eight fit: rows of five and four, not eight and one
        const { blocks } = layoutWaffle(toInput(flatOrganization, 720, 560));
        const perRow = blocks.reduce<Record<number, number>>(
            (rows, block) => ({ ...rows, [block.y]: (rows[block.y] ?? 0) + 1 }),
            {},
        );
        expect(Object.values(perRow)).toEqual([5, 4]);
    });

    it("keeps a row tall enough for its blocks' parts at their minimum height", () => {
        const many = {
            id: 'many',
            size: 10,
            parts: Array.from({ length: 6 }, (_, index) => ({
                id: `part${index}`,
                size: 1,
                hasName: true,
            })),
        };
        const { blocks } = layoutWaffle({
            blocks: [
                lone('a', 5000),
                lone('b', 4000),
                lone('c', 3000),
                lone('d', 2000),
                many,
            ],
            width: 320,
            height: 560,
        });
        const placed = blocks.find((block) => block.id === 'many');
        expect(placed?.parts.map((part) => part.height)).toEqual(
            Array(6).fill(MIN_PART_HEIGHT),
        );
    });

    it("stacks a block's parts by their share of its people, never under 26 px", () => {
        const { blocks } = layoutWaffle({
            blocks: [
                {
                    id: 'ops',
                    size: 2260,
                    parts: [
                        { id: 'supply', size: 1750, hasName: true },
                        { id: 'facilities', size: 120, hasName: true },
                        { id: 'safety', size: 45, hasName: true },
                        { id: 'own:ops', size: 345, hasName: true },
                    ],
                },
            ],
            width: 720,
            height: 560,
        });
        const [block] = blocks;
        const heights = block.parts.map((part) => part.height);
        expect(Math.min(...heights)).toBe(MIN_PART_HEIGHT);
        const area = block.height - BLOCK_HEADER_HEIGHT - BLOCK_PADDING;
        expect(sum(heights) + PART_GAP * 3).toBe(area);
        expect(block.parts[0].y).toBe(BLOCK_HEADER_HEIGHT);
        block.parts.forEach((part) => {
            expect(part.x).toBe(BLOCK_PADDING);
            expect(part.width).toBe(block.width - 2 * BLOCK_PADDING);
        });
        expect(block.parts[1].y).toBe(
            block.parts[0].y + block.parts[0].height + PART_GAP,
        );
        expect(heights[0] / heights[3]).toBeCloseTo(1750 / 345, 0);
    });

    it('labels a part only when it is taller than 30 px and wider than 100 px', () => {
        const parts = [
            { id: 'big', size: 900, hasName: true },
            { id: 'small', size: 1, hasName: true },
        ];
        const wide = layoutWaffle({
            blocks: [{ id: 'wide', size: 901, parts }],
            width: 400,
            height: 560,
        }).blocks[0];
        expect(wide.parts.map((part) => part.isLabelled)).toEqual([
            true,
            false,
        ]);
        // A labelled part keeps its squares under the label
        expect(wide.parts[0].content.y).toBeGreaterThan(
            wide.parts[1].content.y,
        );
        const narrow = layoutWaffle({
            blocks: [
                { id: 'narrow', size: 901, parts },
                lone('huge', 20000 - 901),
            ],
            width: 720,
            height: 560,
        }).blocks.find((block) => block.id === 'narrow');
        expect(narrow?.width).toBe(MIN_BLOCK_WIDTH);
        expect(narrow?.parts.map((part) => part.isLabelled)).toEqual([
            false,
            false,
        ]);
    });

    it.each([
        ['6,000-headcount', deepOrganization],
        ['enterprise-shaped', flatOrganization],
        ['small', seededOrganization()],
    ])(
        'fits every square of the %s organization inside its part at every width',
        (_, departments) => {
            [320, 480, 720, 1180].forEach((width) => {
                const input = toInput(departments, width, 560);
                const sizes = new Map(
                    input.blocks.flatMap((block) =>
                        block.parts.map((part) => [part.id, part.size]),
                    ),
                );
                layoutWaffle(input).blocks.forEach((block) => {
                    expect(block.x + block.width).toBeLessThanOrEqual(
                        width - BOARD_PADDING,
                    );
                    expect(block.y + block.height).toBeLessThanOrEqual(
                        560 - BOARD_PADDING,
                    );
                    block.parts.forEach(({ id, grid, content }) => {
                        if (grid.kind !== 'squares') return;
                        const pitch = grid.cell + grid.gap;
                        const rows = Math.ceil(
                            (sizes.get(id) ?? 0) / grid.columns,
                        );
                        expect(
                            grid.columns * pitch - grid.gap,
                        ).toBeLessThanOrEqual(content.width);
                        expect(rows * pitch - grid.gap).toBeLessThanOrEqual(
                            content.height,
                        );
                        expect(grid.cell).toBeGreaterThanOrEqual(3);
                        expect(grid.cell).toBeLessThanOrEqual(10);
                    });
                });
            });
        },
    );

    it('draws every part of the 6,000-headcount organization as squares on a wide page', () => {
        const { blocks, isOverLimit } = layoutWaffle(
            toInput(deepOrganization, 1180, 560),
        );
        expect(isOverLimit).toBe(false);
        expect(
            blocks.flatMap((block) =>
                block.parts.map((part) => part.grid.kind),
            ),
        ).not.toContain('bar');
    });

    it('draws every part as a bar above 20,000 people, and squares at exactly 20,000', () => {
        const over = layoutWaffle({
            blocks: [lone('a', SQUARE_LIMIT - 10), lone('b', 11)],
            width: 1180,
            height: 560,
        });
        expect(over.isOverLimit).toBe(true);
        expect(over.blocks.map((block) => block.parts[0].grid.kind)).toEqual([
            'bar',
            'bar',
        ]);
        const at = layoutWaffle({
            blocks: [lone('a', SQUARE_LIMIT - 10), lone('b', 10)],
            width: 1180,
            height: 560,
        });
        expect(at.isOverLimit).toBe(false);
        expect(at.blocks[1].parts[0].grid.kind).toBe('squares');
    });
});
