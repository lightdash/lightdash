import { describe, expect, it } from 'vitest';
import {
    deepOrganization,
    flatOrganization,
    smallCompany,
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
    MAX_CELL,
    MIN_BLOCK_WIDTH,
    MIN_HEIGHT,
    MIN_PART_HEIGHT,
    PART_GAP,
    PART_PADDING,
    SMALL_ORGANIZATION_CELL,
    SQUARE_LIMIT,
    type PartLayout,
    type WaffleLayout,
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
});

const sizesOf = (input: WaffleLayoutInput) =>
    new Map(
        input.blocks.flatMap((block) =>
            block.parts.map((part) => [part.id, part.size]),
        ),
    );

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

const partsOf = (layout: WaffleLayout): PartLayout[] =>
    layout.blocks.flatMap((block) => block.parts);

// How many blocks each row holds, top to bottom
const rowCounts = (layout: WaffleLayout): number[] => {
    const counts = new Map<number, number>();
    layout.blocks.forEach((block) =>
        counts.set(block.y, (counts.get(block.y) ?? 0) + 1),
    );
    return [...counts.keys()]
        .sort((a, b) => a - b)
        .map((y) => counts.get(y) ?? 0);
};

// How each part reads: its squares, a bar or nothing, and whether it is labelled
const readingOf = (layout: WaffleLayout): string[] =>
    partsOf(layout).map(
        (part) =>
            `${part.id}: ${part.grid.kind === 'squares' ? `${part.grid.cell}+${part.grid.gap}x${part.grid.columns}` : part.grid.kind}${part.isLabelled ? ', labelled' : ''}`,
    );

// The height a part's rows of squares take
const squaresHeight = (part: PartLayout, size: number): number =>
    part.grid.kind === 'squares'
        ? Math.ceil(size / part.grid.columns) *
              (part.grid.cell + part.grid.gap) -
          part.grid.gap
        : 0;

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
    it('never draws a square larger than the cap, however much room there is', () => {
        expect(getSquaresGrid(400, 400, 100, MAX_CELL)).toEqual({
            kind: 'squares',
            cell: 10,
            gap: 2,
            columns: 33,
        });
        expect(getSquaresGrid(400, 400, 10, SMALL_ORGANIZATION_CELL)).toEqual({
            kind: 'squares',
            cell: 16,
            gap: 2,
            columns: 22,
        });
    });

    it('takes the side from the room each person has, and shrinks it until the rows fit with their gaps', () => {
        // floor(sqrt(200 × 100 / 300)) = 8, but 8 and 7 px rows with their gaps are taller than 100 px
        expect(getSquaresGrid(200, 100, 300, MAX_CELL)).toEqual({
            kind: 'squares',
            cell: 6,
            gap: 2,
            columns: 25,
        });
    });

    it('sets squares under 5 px 1 px apart', () => {
        expect(getSquaresGrid(40, 40, 100, MAX_CELL)).toEqual({
            kind: 'squares',
            cell: 3,
            gap: 1,
            columns: 10,
        });
    });

    it('draws one stacked bar when the squares would be under 3 px', () => {
        // floor(sqrt(20 × 20 / 100)) = 2
        expect(getSquaresGrid(20, 20, 100, MAX_CELL)).toEqual({ kind: 'bar' });
        // 3 px fits the area but not with the gaps
        expect(getSquaresGrid(30, 30, 100, MAX_CELL)).toEqual({ kind: 'bar' });
    });

    it('draws nothing for nobody', () => {
        expect(getSquaresGrid(100, 100, 0, MAX_CELL)).toEqual({
            kind: 'empty',
        });
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
    it('makes each block as wide as its share of the row, never narrower than 72 px, and as tall as its row', () => {
        const { blocks } = layoutWaffle({
            blocks: [lone('a', 2350), lone('b', 1900), lone('c', 12)],
            width: 720,
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
            expect(block.height).toBe(a.height);
        });
    });

    it.each([
        ['six departments at 400 px', 6, 400, [3, 3]],
        ['seven departments at 320 px', 7, 320, [3, 2, 2]],
        ['ten departments at 400 px', 10, 400, [4, 3, 3]],
        ['thirteen departments at 400 px', 13, 400, [4, 3, 3, 3]],
    ])(
        'wraps %s to rows that differ by at most one block, so no department sits alone on a row it could share',
        (_, count, width, expected) => {
            const input = {
                blocks: Array.from({ length: count }, (__, index) =>
                    lone(`d${index}`, 100 - index),
                ),
                width,
            };
            const layout = layoutWaffle(input);
            expect(rowCounts(layout)).toEqual(expected);
            // Largest first, each row as wide as the drawing, and the rows stacked
            expect(layout.blocks.map((block) => block.id)).toEqual(
                input.blocks.map((block) => block.id),
            );
            const rows = [...new Set(layout.blocks.map((block) => block.y))];
            rows.forEach((y, index) => {
                const row = layout.blocks.filter((block) => block.y === y);
                expect(row[0].x).toBe(BOARD_PADDING);
                expect(
                    sum(row.map((block) => block.width)) +
                        BLOCK_GAP * (row.length - 1),
                ).toBe(width - 2 * BOARD_PADDING);
                if (index > 0) {
                    const above = layout.blocks.find(
                        (block) => block.y === rows[index - 1],
                    );
                    expect(y).toBe(
                        (above?.y ?? 0) + (above?.height ?? 0) + BLOCK_GAP,
                    );
                }
            });
        },
    );

    it('wraps the enterprise-shaped organization at 720 px to rows of five and four', () => {
        expect(rowCounts(layoutWaffle(toInput(flatOrganization, 720)))).toEqual(
            [5, 4],
        );
    });

    it("stacks a block's parts, each as tall as its rows of squares need and never under 26 px", () => {
        const input = {
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
        };
        const sizes = sizesOf(input);
        const [block] = layoutWaffle(input).blocks;
        expect(block.parts[0].y).toBe(BLOCK_HEADER_HEIGHT);
        block.parts.forEach((part, index) => {
            expect(part.x).toBe(BLOCK_PADDING);
            expect(part.width).toBe(block.width - 2 * BLOCK_PADDING);
            expect(part.height).toBeGreaterThanOrEqual(MIN_PART_HEIGHT);
            if (part.grid.kind === 'squares') {
                expect(part.height).toBe(
                    Math.max(
                        MIN_PART_HEIGHT,
                        part.content.y +
                            squaresHeight(part, sizes.get(part.id) ?? 0) +
                            PART_PADDING,
                    ),
                );
            }
            if (index > 0) {
                const above = block.parts[index - 1];
                expect(part.y).toBe(above.y + above.height + PART_GAP);
            }
        });
        const last = block.parts[block.parts.length - 1];
        expect(block.height).toBe(last.y + last.height + BLOCK_PADDING);
    });

    it('labels a part only when it is wider than 100 px and, label and all, taller than 30 px', () => {
        const parts = [
            { id: 'big', size: 900, hasName: true },
            { id: 'small', size: 1, hasName: true },
        ];
        const wide = layoutWaffle({
            blocks: [{ id: 'wide', size: 901, parts }],
            width: 400,
        }).blocks[0];
        // The one person's part is 26 px tall, too short for a label
        expect(wide.parts.map((part) => part.isLabelled)).toEqual([
            true,
            false,
        ]);
        expect(wide.parts[1].height).toBe(MIN_PART_HEIGHT);
        // A labelled part keeps its squares under the label
        expect(wide.parts[0].content.y).toBeGreaterThan(PART_PADDING);
        expect(wide.parts[1].content.y).toBe(PART_PADDING);
        const narrow = layoutWaffle({
            blocks: [
                { id: 'narrow', size: 901, parts },
                lone('huge', 20000 - 901),
            ],
            width: 720,
        }).blocks.find((block) => block.id === 'narrow');
        expect(narrow?.width).toBe(MIN_BLOCK_WIDTH);
        expect(narrow?.parts.map((part) => part.isLabelled)).toEqual([
            false,
            false,
        ]);
        // Every label across the fixtures sits on a part over 30 px tall and 100 px wide
        [deepOrganization, flatOrganization, seededOrganization()].forEach(
            (departments) =>
                [320, 530, 720, 868, 1180].forEach((width) =>
                    partsOf(layoutWaffle(toInput(departments, width)))
                        .filter((part) => part.isLabelled)
                        .forEach((part) => {
                            expect(part.height).toBeGreaterThan(30);
                            expect(part.width).toBeGreaterThan(100);
                        }),
                ),
        );
    });

    it.each([
        ['6,000-headcount', deepOrganization],
        ['enterprise-shaped', flatOrganization],
        ['small', seededOrganization()],
        ['33-person', smallCompany],
    ])(
        'fits every square of the %s organization inside its part, and every part inside the drawing, at every width',
        (_, departments) => {
            [320, 480, 720, 868, 1180].forEach((width) => {
                const input = toInput(departments, width);
                const sizes = sizesOf(input);
                const layout = layoutWaffle(input);
                layout.blocks.forEach((block) => {
                    expect(block.x + block.width).toBeLessThanOrEqual(
                        width - BOARD_PADDING,
                    );
                    expect(block.y + block.height).toBeLessThanOrEqual(
                        layout.height - BOARD_PADDING,
                    );
                    block.parts.forEach((part) => {
                        expect(part.y + part.height).toBeLessThanOrEqual(
                            block.height - BLOCK_PADDING,
                        );
                        const { grid, content } = part;
                        if (grid.kind !== 'squares') return;
                        const pitch = grid.cell + grid.gap;
                        expect(
                            grid.columns * pitch - grid.gap,
                        ).toBeLessThanOrEqual(content.width);
                        expect(
                            squaresHeight(part, sizes.get(part.id) ?? 0),
                        ).toBeLessThanOrEqual(content.height);
                        expect(grid.cell).toBeGreaterThanOrEqual(3);
                        expect(grid.cell).toBeLessThanOrEqual(16);
                    });
                });
            });
        },
    );

    it("keeps the 6,000-headcount organization's squares, labels and bars as they were with a 560 px drawing", () => {
        expect(readingOf(layoutWaffle(toInput(deepOrganization, 868)))).toEqual(
            [
                'Supply Chain: 4+1x35, labelled',
                'Facilities: 3+1x44',
                'Quality: 4+1x35',
                'Health & Safety: 5+2x25',
                'own:Operations: 3+1x44, labelled',
                'Sales: 4+1x28, labelled',
                'Customer Success: 4+1x28, labelled',
                'Marketing: bar, labelled',
                'own:Commercial: 3+1x35, labelled',
                'Engineering: 4+1x10',
                'Product Management: 4+1x10',
                'Design: 4+1x10',
                'own:Product & Engineering: 4+1x10',
                'Controllership: 4+1x10',
                'Procurement: 5+2x7',
                'FP&A: 4+1x10',
                'Tax: 4+1x10',
                'Treasury: 4+1x10',
                'Internal Audit: 4+1x10',
                'own:Finance: 4+1x10',
                'HR Business Partners: 10+2x4',
                'Talent Acquisition: 10+2x4',
                'People Operations: 10+2x4',
                'Learning & Development: 10+2x4',
                'Business Intelligence: 10+2x4',
                'Analytics Engineering: 10+2x4',
                'Data Science: 10+2x4',
                'Data Governance: 10+2x4',
                'own:Data & Analytics: 10+2x4',
                'own:Legal & Compliance: 10+2x4',
                'own:Executive Office: 10+2x4',
            ],
        );
        expect(readingOf(layoutWaffle(toInput(deepOrganization, 720)))).toEqual(
            [
                'Supply Chain: 3+1x24, labelled',
                'Facilities: bar',
                'Quality: 3+1x24',
                'Health & Safety: 4+1x19',
                'own:Operations: bar, labelled',
                'Sales: 3+1x18',
                'Customer Success: 3+1x18',
                'Marketing: bar',
                'own:Commercial: bar',
                'Engineering: 4+1x10',
                'Product Management: 4+1x10',
                'Design: 4+1x10',
                'own:Product & Engineering: 4+1x10',
                'Controllership: 4+1x10',
                'Procurement: 5+2x7',
                'FP&A: 4+1x10',
                'Tax: 4+1x10',
                'Treasury: 4+1x10',
                'Internal Audit: 4+1x10',
                'own:Finance: 4+1x10',
                'HR Business Partners: 10+2x4',
                'Talent Acquisition: 10+2x4',
                'People Operations: 10+2x4',
                'Learning & Development: 10+2x4',
                'Business Intelligence: 10+2x4',
                'Analytics Engineering: 10+2x4',
                'Data Science: 10+2x4',
                'Data Governance: 10+2x4',
                'own:Data & Analytics: 10+2x4',
                'own:Legal & Compliance: 10+2x4',
                'own:Executive Office: 10+2x4',
            ],
        );
    });

    it('is as tall as its content, with every block as tall as the tallest one in its row', () => {
        const layout = layoutWaffle(toInput(deepOrganization, 868));
        const contentHeights = layout.blocks.map((block) => {
            const last = block.parts[block.parts.length - 1];
            return last.y + last.height + BLOCK_PADDING;
        });
        layout.blocks.forEach((block) =>
            expect(block.height).toBe(Math.max(...contentHeights)),
        );
        expect(layout.height).toBe(
            2 * BOARD_PADDING + Math.max(...contentHeights),
        );
        // Shorter than the 560 px drawing it used to fill
        expect(layout.height).toBeLessThan(560);
    });

    it('draws a 33-person company as a band of 16 px squares, every part at least 40% squares, in the 160 px minimum', () => {
        const input = toInput(smallCompany, 870);
        const sizes = sizesOf(input);
        const layout = layoutWaffle(input);
        expect(rowCounts(layout)).toEqual([4]);
        partsOf(layout).forEach((part) => {
            expect(part.grid).toMatchObject({
                kind: 'squares',
                cell: SMALL_ORGANIZATION_CELL,
            });
            // One row each, so the part is its minimum height
            expect(part.height).toBe(MIN_PART_HEIGHT);
            const cell =
                part.grid.kind === 'squares' ? part.grid.cell : Number.NaN;
            expect(
                ((sizes.get(part.id) ?? 0) * cell * cell) /
                    (part.width * part.height),
            ).toBeGreaterThanOrEqual(0.4);
        });
        layout.blocks.forEach((block) =>
            expect(block.height).toBe(
                BLOCK_HEADER_HEIGHT + MIN_PART_HEIGHT + BLOCK_PADDING,
            ),
        );
        expect(layout.height).toBe(MIN_HEIGHT);
    });

    it("keeps squares at 10 px or less where some part's people would not fit on one row of 16 px squares", () => {
        // At 720 px the 33-person company's 7 people need 124 px for one row; their part has 123
        [
            toInput(smallCompany, 720),
            toInput(seededOrganization(), 868),
        ].forEach((input) =>
            partsOf(layoutWaffle(input)).forEach((part) => {
                if (part.grid.kind === 'squares') {
                    expect(part.grid.cell).toBeLessThanOrEqual(MAX_CELL);
                }
            }),
        );
    });

    it('keeps every part at least 26 px tall when there are more rows than a 560 px drawing could hold', () => {
        // 25 departments of 5 sub-departments each, as in the review
        const layout = layoutWaffle({
            blocks: Array.from({ length: 25 }, (_, index) => ({
                id: `d${index}`,
                size: 150,
                parts: Array.from({ length: 5 }, (__, part) => ({
                    id: `d${index}:${part}`,
                    size: 30,
                    hasName: true,
                })),
            })),
            width: 870,
        });
        const heights = partsOf(layout).map((part) => part.height);
        expect(heights).toHaveLength(125);
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(MIN_PART_HEIGHT);
        // The waffle grows past 560 px rather than squeezing them
        expect(layout.height).toBeGreaterThan(560);
        expect(
            partsOf(layout).filter((part) => part.grid.kind === 'bar'),
        ).toHaveLength(0);
    });

    it('draws every part of the 6,000-headcount organization as squares on a wide page', () => {
        const { blocks, isOverLimit } = layoutWaffle(
            toInput(deepOrganization, 1180),
        );
        expect(isOverLimit).toBe(false);
        expect(
            blocks.flatMap((block) =>
                block.parts.map((part) => part.grid.kind),
            ),
        ).not.toContain('bar');
    });

    it('counts the squares drawn, leaving out the people in parts drawn as bars', () => {
        // At 720 px Facilities (120), the people directly in Operations (345), Marketing (180) and the people
        // directly in Commercial (260) are bars
        expect(layoutWaffle(toInput(deepOrganization, 720)).squareCount).toBe(
            5587 - 120 - 345 - 180 - 260,
        );
        expect(layoutWaffle(toInput(smallCompany, 870)).squareCount).toBe(33);
    });

    it('draws every part as a bar above 20,000 people, each keeping its share of a 560 px drawing, and squares at exactly 20,000', () => {
        const over = layoutWaffle({
            blocks: [lone('a', SQUARE_LIMIT - 10), lone('b', 11)],
            width: 1180,
        });
        expect(over.isOverLimit).toBe(true);
        expect(over.squareCount).toBe(0);
        expect(over.blocks.map((block) => block.parts[0].grid.kind)).toEqual([
            'bar',
            'bar',
        ]);
        expect(over.height).toBe(560);
        const at = layoutWaffle({
            blocks: [lone('a', SQUARE_LIMIT - 10), lone('b', 10)],
            width: 1180,
        });
        expect(at.isOverLimit).toBe(false);
        expect(at.blocks[1].parts[0].grid.kind).toBe('squares');
    });
});
