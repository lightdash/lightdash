// Where everything in the waffle goes, in whole pixels from the top-left corner of the drawing

// Room around the blocks, between them, and inside a block around its parts
export const BOARD_PADDING = 12;
export const BLOCK_GAP = 8;
export const BLOCK_PADDING = 6;
// A block's name and counts line sit above its parts
export const BLOCK_HEADER_HEIGHT = 46;
export const PART_GAP = 4;
const PART_PADDING = 4;
const PART_LABEL_HEIGHT = 16;
export const MIN_BLOCK_WIDTH = 72;
export const MIN_PART_HEIGHT = 26;
// A part is labelled only when it is taller and wider than these
const LABEL_MIN_HEIGHT = 30;
const LABEL_MIN_WIDTH = 100;
const MIN_CELL = 3;
const MAX_CELL = 10;
// Squares this size and up sit 2 px apart, smaller ones 1 px
const ROOMY_CELL = 5;
// Above this many people in view every part is drawn as a bar, as one element per person gets slow
export const SQUARE_LIMIT = 20000;

export type Box = { x: number; y: number; width: number; height: number };

export type WaffleGrid =
    | { kind: 'squares'; cell: number; gap: number; columns: number }
    | { kind: 'bar' }
    | { kind: 'empty' };

export type PartLayout = Box & {
    id: string;
    isLabelled: boolean;
    // Where the squares or the bar go, from the part's top-left corner
    content: Box;
    grid: WaffleGrid;
};

export type BlockLayout = Box & { id: string; parts: PartLayout[] };

export type WaffleLayout = { blocks: BlockLayout[]; isOverLimit: boolean };

export type WaffleLayoutInput = {
    blocks: {
        id: string;
        size: number;
        parts: { id: string; size: number; hasName: boolean }[];
    }[];
    width: number;
    height: number;
};

// Whole pixels from shares that add up to `total`: each share rounded down, and the pixels left over go to the
// shares that lost the most
const toWholePixels = (shares: number[], total: number): number[] => {
    const whole = shares.map((share) => Math.floor(share));
    const leftOver = Math.floor(total) - whole.reduce((sum, w) => sum + w, 0);
    shares
        .map((share, index) => ({ index, lost: share - whole[index] }))
        .sort((a, b) => b.lost - a.lost || a.index - b.index)
        .slice(0, Math.max(leftOver, 0))
        .forEach(({ index }) => {
            whole[index] += 1;
        });
    return whole;
};

type Share = { weight: number; minimum: number };

// Shares `total` pixels in proportion to the weights, none below its minimum. When the minimums alone do not fit,
// every item shrinks in step with its minimum
export const allocate = (total: number, items: Share[]): number[] => {
    const available = Math.max(total, 0);
    if (items.length === 0) return [];
    const minimums = items.reduce((sum, item) => sum + item.minimum, 0);
    if (minimums >= available) {
        return toWholePixels(
            items.map((item) =>
                minimums > 0
                    ? (available * item.minimum) / minimums
                    : available / items.length,
            ),
            available,
        );
    }
    // Items held at their minimum; the rest share what is left by weight, until none of them falls below its own
    const held = new Set<number>();
    const share = (): number[] => {
        const free = items.reduce(
            (left, item, index) =>
                held.has(index) ? left - item.minimum : left,
            available,
        );
        const freeWeight = items.reduce(
            (sum, item, index) =>
                held.has(index) ? sum : sum + Math.max(item.weight, 0),
            0,
        );
        const freeCount = items.length - held.size;
        return items.map((item, index) => {
            if (held.has(index)) return item.minimum;
            return freeWeight > 0
                ? (free * Math.max(item.weight, 0)) / freeWeight
                : free / freeCount;
        });
    };
    const findShort = (shares: number[]): number[] =>
        shares.flatMap((value, index) =>
            !held.has(index) && value < items[index].minimum ? [index] : [],
        );
    let shares = share();
    let short = findShort(shares);
    while (short.length > 0) {
        short.forEach((index) => held.add(index));
        shares = share();
        short = findShort(shares);
    }
    return toWholePixels(shares, available);
};

// The largest squares, at most 10 px, that fit `count` people into the box in rows: the side starts at
// floor(sqrt(area / count)) and shrinks until every row fits. Under 3 px the part is one stacked bar instead
export const getSquaresGrid = (
    width: number,
    height: number,
    count: number,
): WaffleGrid => {
    if (count <= 0) return { kind: 'empty' };
    if (width <= 0 || height <= 0) return { kind: 'bar' };
    const fitted = Math.floor(Math.sqrt((width * height) / count));
    for (let cell = Math.min(fitted, MAX_CELL); cell >= MIN_CELL; cell -= 1) {
        const gap = cell < ROOMY_CELL ? 1 : 2;
        const columns = Math.floor((width + gap) / (cell + gap));
        if (
            columns > 0 &&
            Math.ceil(count / columns) * (cell + gap) - gap <= height
        ) {
            return { kind: 'squares', cell, gap, columns };
        }
    }
    return { kind: 'bar' };
};

// Where the square in a given place sits, from the top-left corner of its part's squares, reading left to right
// and then down
export const getSquareOffset = (
    grid: { cell: number; gap: number; columns: number },
    position: number,
): { x: number; y: number } => ({
    x: (position % grid.columns) * (grid.cell + grid.gap),
    y: Math.floor(position / grid.columns) * (grid.cell + grid.gap),
});

const layoutParts = (
    parts: WaffleLayoutInput['blocks'][number]['parts'],
    area: Box,
    isOverLimit: boolean,
): PartLayout[] => {
    const heights = allocate(
        area.height - PART_GAP * Math.max(parts.length - 1, 0),
        parts.map((part) => ({ weight: part.size, minimum: MIN_PART_HEIGHT })),
    );
    let y = area.y;
    return parts.map((part, index) => {
        const height = heights[index];
        const box = { x: area.x, y, width: area.width, height };
        y += height + PART_GAP;
        const isLabelled =
            part.hasName &&
            height > LABEL_MIN_HEIGHT &&
            area.width > LABEL_MIN_WIDTH;
        const top = PART_PADDING + (isLabelled ? PART_LABEL_HEIGHT : 0);
        const content = {
            x: PART_PADDING,
            y: top,
            width: Math.max(area.width - PART_PADDING * 2, 0),
            height: Math.max(height - top - PART_PADDING, 0),
        };
        const grid: WaffleGrid =
            isOverLimit && part.size > 0
                ? { kind: 'bar' }
                : getSquaresGrid(content.width, content.height, part.size);
        return { ...box, id: part.id, isLabelled, content, grid };
    });
};

// A row is never shorter than its blocks' names and their parts at their minimum height
const getMinRowHeight = (row: WaffleLayoutInput['blocks']): number =>
    BLOCK_HEADER_HEIGHT +
    BLOCK_PADDING +
    Math.max(
        ...row.map(
            (block) =>
                block.parts.length * (MIN_PART_HEIGHT + PART_GAP) - PART_GAP,
        ),
        MIN_PART_HEIGHT,
    );

// Blocks share each row by headcount, never under 72 px, and wrap evenly over as few rows as hold them; rows share
// the height the same way. A block's parts are stacked by headcount, never under 26 px
export const layoutWaffle = ({
    blocks,
    width,
    height,
}: WaffleLayoutInput): WaffleLayout => {
    const isOverLimit =
        blocks.reduce((sum, block) => sum + block.size, 0) > SQUARE_LIMIT;
    const innerWidth = Math.max(width - BOARD_PADDING * 2, 0);
    const innerHeight = Math.max(height - BOARD_PADDING * 2, 0);
    const fitInRow = Math.max(
        Math.floor((innerWidth + BLOCK_GAP) / (MIN_BLOCK_WIDTH + BLOCK_GAP)),
        1,
    );
    const rowCount = Math.ceil(blocks.length / fitInRow);
    const perRow = Math.ceil(blocks.length / Math.max(rowCount, 1));
    const rows = Array.from({ length: rowCount }, (_, row) =>
        blocks.slice(row * perRow, (row + 1) * perRow),
    );
    const rowHeights = allocate(
        innerHeight - BLOCK_GAP * Math.max(rows.length - 1, 0),
        rows.map((row) => ({
            weight: row.reduce((sum, block) => sum + block.size, 0),
            minimum: getMinRowHeight(row),
        })),
    );
    let y = BOARD_PADDING;
    const placed = rows.flatMap((row, rowIndex) => {
        const rowHeight = rowHeights[rowIndex];
        const widths = allocate(
            innerWidth - BLOCK_GAP * Math.max(row.length - 1, 0),
            row.map((block) => ({
                weight: block.size,
                minimum: MIN_BLOCK_WIDTH,
            })),
        );
        let x = BOARD_PADDING;
        const rowBlocks = row.map((block, index): BlockLayout => {
            const box = { x, y, width: widths[index], height: rowHeight };
            x += widths[index] + BLOCK_GAP;
            return {
                ...box,
                id: block.id,
                parts: layoutParts(
                    block.parts,
                    {
                        x: BLOCK_PADDING,
                        y: BLOCK_HEADER_HEIGHT,
                        width: Math.max(box.width - BLOCK_PADDING * 2, 0),
                        height: Math.max(
                            box.height - BLOCK_HEADER_HEIGHT - BLOCK_PADDING,
                            0,
                        ),
                    },
                    isOverLimit,
                ),
            };
        });
        y += rowHeight + BLOCK_GAP;
        return rowBlocks;
    });
    return { blocks: placed, isOverLimit };
};
