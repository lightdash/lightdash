// Where everything in the waffle goes, in whole pixels from the top-left corner of the drawing

// Room around the blocks, between them, and inside a block around its parts
export const BOARD_PADDING = 12;
export const BLOCK_GAP = 8;
export const BLOCK_PADDING = 6;
// A block's name and counts line sit above its parts
export const BLOCK_HEADER_HEIGHT = 46;
export const PART_GAP = 4;
export const PART_PADDING = 4;
const PART_LABEL_HEIGHT = 16;
export const MIN_BLOCK_WIDTH = 72;
export const MIN_PART_HEIGHT = 26;
// The waffle is as tall as its content needs, and never shorter than this
export const MIN_HEIGHT = 160;
// Squares are sized as if the waffle filled a drawing this tall, as the map does, then take only the height they need
const REFERENCE_HEIGHT = 560;
// A part is labelled only when it is taller and wider than these
const LABEL_MIN_HEIGHT = 30;
const LABEL_MIN_WIDTH = 100;
const MIN_CELL = 3;
export const MAX_CELL = 10;
// Where every part's people fit on one row at this size, a small organization, squares are drawn at it
export const SMALL_ORGANIZATION_CELL = 16;
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

export type WaffleLayout = {
    blocks: BlockLayout[];
    isOverLimit: boolean;
    // The drawing's height, from its content
    height: number;
    // How many squares are drawn: the people in parts drawn as squares rather than bars
    squareCount: number;
};

type InputPart = { id: string; size: number; hasName: boolean };
type InputBlock = { id: string; size: number; parts: InputPart[] };

export type WaffleLayoutInput = { blocks: InputBlock[]; width: number };

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

const getGap = (cell: number): number => (cell < ROOMY_CELL ? 1 : 2);

// The largest squares, at most `maxCell` px, that fit `count` people into the box in rows: the side starts at
// floor(sqrt(area / count)) and shrinks until every row fits. Under 3 px the part is one stacked bar instead
export const getSquaresGrid = (
    width: number,
    height: number,
    count: number,
    maxCell: number,
): WaffleGrid => {
    if (count <= 0) return { kind: 'empty' };
    if (width <= 0 || height <= 0) return { kind: 'bar' };
    const fitted = Math.floor(Math.sqrt((width * height) / count));
    for (let cell = Math.min(fitted, maxCell); cell >= MIN_CELL; cell -= 1) {
        const gap = getGap(cell);
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

// How tall a part's rows of squares are
const getSquaresHeight = (
    grid: Extract<WaffleGrid, { kind: 'squares' }>,
    count: number,
): number =>
    Math.ceil(count / grid.columns) * (grid.cell + grid.gap) - grid.gap;

// A block's parts, stacked. Their squares are sized from each part's share of the block's reference height; then a
// part with squares takes the height its rows need and a bar keeps its share
const layoutParts = (
    parts: InputPart[],
    width: number,
    referenceHeight: number,
    maxCell: number,
    isOverLimit: boolean,
): PartLayout[] => {
    const partWidth = Math.max(width - BLOCK_PADDING * 2, 0);
    const contentWidth = Math.max(partWidth - PART_PADDING * 2, 0);
    const references = allocate(
        referenceHeight -
            BLOCK_HEADER_HEIGHT -
            BLOCK_PADDING -
            PART_GAP * Math.max(parts.length - 1, 0),
        parts.map((part) => ({ weight: part.size, minimum: MIN_PART_HEIGHT })),
    );
    let y = BLOCK_HEADER_HEIGHT;
    return parts.map((part, index) => {
        const reference = references[index];
        const isLabelledAtReference =
            part.hasName &&
            reference > LABEL_MIN_HEIGHT &&
            partWidth > LABEL_MIN_WIDTH;
        const referenceTop =
            PART_PADDING + (isLabelledAtReference ? PART_LABEL_HEIGHT : 0);
        const grid: WaffleGrid =
            isOverLimit && part.size > 0
                ? { kind: 'bar' }
                : getSquaresGrid(
                      contentWidth,
                      Math.max(reference - referenceTop - PART_PADDING, 0),
                      part.size,
                      maxCell,
                  );
        const needed =
            grid.kind === 'squares' ? getSquaresHeight(grid, part.size) : 0;
        // The label stays only where the part, label and all, is still over 30 px tall
        const isLabelled =
            isLabelledAtReference &&
            (grid.kind === 'bar' ||
                PART_PADDING * 2 + PART_LABEL_HEIGHT + needed >
                    LABEL_MIN_HEIGHT);
        const top = PART_PADDING + (isLabelled ? PART_LABEL_HEIGHT : 0);
        const height =
            grid.kind === 'bar'
                ? reference
                : Math.max(MIN_PART_HEIGHT, top + needed + PART_PADDING);
        const box = { x: BLOCK_PADDING, y, width: partWidth, height };
        y += height + PART_GAP;
        return {
            ...box,
            id: part.id,
            isLabelled,
            content: {
                x: PART_PADDING,
                y: top,
                width: contentWidth,
                height: Math.max(height - top - PART_PADDING, 0),
            },
            grid,
        };
    });
};

// A row is never shorter than its blocks' names and their parts at their minimum height
const getMinRowHeight = (row: InputBlock[]): number =>
    BLOCK_HEADER_HEIGHT +
    BLOCK_PADDING +
    Math.max(
        ...row.map(
            (block) =>
                block.parts.length * (MIN_PART_HEIGHT + PART_GAP) - PART_GAP,
        ),
        MIN_PART_HEIGHT,
    );

// As few rows as hold the blocks at 72 px, largest first, as even as they can be: the first rows take one more
// block where they cannot all hold the same number
const getRows = (blocks: InputBlock[], innerWidth: number): InputBlock[][] => {
    const fitInRow = Math.max(
        Math.floor((innerWidth + BLOCK_GAP) / (MIN_BLOCK_WIDTH + BLOCK_GAP)),
        1,
    );
    const rowCount = Math.ceil(blocks.length / fitInRow);
    let start = 0;
    return Array.from({ length: rowCount }, (_, row) => {
        const count =
            Math.floor(blocks.length / rowCount) +
            (row < blocks.length % rowCount ? 1 : 0);
        const rowBlocks = blocks.slice(start, start + count);
        start += count;
        return rowBlocks;
    });
};

// Every part's people fit on one row of the small organization's squares across their block
const fitsOnOneRow = (rows: InputBlock[][], widths: number[][]): boolean =>
    rows.every((row, rowIndex) =>
        row.every((block, index) => {
            const contentWidth =
                widths[rowIndex][index] - BLOCK_PADDING * 2 - PART_PADDING * 2;
            const gap = getGap(SMALL_ORGANIZATION_CELL);
            const columns = Math.floor(
                (contentWidth + gap) / (SMALL_ORGANIZATION_CELL + gap),
            );
            return block.parts.every((part) => part.size <= columns);
        }),
    );

const sumOf = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0);

// Blocks share each row by headcount, never under 72 px, and wrap evenly over as few rows as hold them. Squares are
// sized as in a 560 px drawing, then every row is as tall as its tallest block's squares need
export const layoutWaffle = ({
    blocks,
    width,
}: WaffleLayoutInput): WaffleLayout => {
    const isOverLimit = sumOf(blocks.map((block) => block.size)) > SQUARE_LIMIT;
    const innerWidth = Math.max(width - BOARD_PADDING * 2, 0);
    const rows = getRows(blocks, innerWidth);
    const widths = rows.map((row) =>
        allocate(
            innerWidth - BLOCK_GAP * Math.max(row.length - 1, 0),
            row.map((block) => ({
                weight: block.size,
                minimum: MIN_BLOCK_WIDTH,
            })),
        ),
    );
    // Each row's share of the reference height, never under what its parts need
    const minimums = rows.map(getMinRowHeight);
    const references = allocate(
        Math.max(
            REFERENCE_HEIGHT -
                BOARD_PADDING * 2 -
                BLOCK_GAP * Math.max(rows.length - 1, 0),
            sumOf(minimums),
        ),
        rows.map((row, index) => ({
            weight: sumOf(row.map((block) => block.size)),
            minimum: minimums[index],
        })),
    );
    const maxCell =
        !isOverLimit && fitsOnOneRow(rows, widths)
            ? SMALL_ORGANIZATION_CELL
            : MAX_CELL;
    let y = BOARD_PADDING;
    const placed = rows.flatMap((row, rowIndex) => {
        const partsByBlock = row.map((block, index) =>
            layoutParts(
                block.parts,
                widths[rowIndex][index],
                references[rowIndex],
                maxCell,
                isOverLimit,
            ),
        );
        // Every block in a row is as tall as the tallest one's parts need
        const rowHeight = Math.max(
            ...partsByBlock.map((parts) =>
                parts.length === 0
                    ? BLOCK_HEADER_HEIGHT + BLOCK_PADDING
                    : parts[parts.length - 1].y +
                      parts[parts.length - 1].height +
                      BLOCK_PADDING,
            ),
        );
        let x = BOARD_PADDING;
        const rowBlocks = row.map((block, index): BlockLayout => {
            const box = {
                x,
                y,
                width: widths[rowIndex][index],
                height: rowHeight,
            };
            x += box.width + BLOCK_GAP;
            return { ...box, id: block.id, parts: partsByBlock[index] };
        });
        y += rowHeight + BLOCK_GAP;
        return rowBlocks;
    });
    const parts = blocks.flatMap((block) => block.parts);
    const grids = new Map(
        placed.flatMap((block) =>
            block.parts.map((part) => [part.id, part.grid.kind]),
        ),
    );
    return {
        blocks: placed,
        isOverLimit,
        height: Math.max(
            rows.length === 0 ? 0 : y - BLOCK_GAP + BOARD_PADDING,
            MIN_HEIGHT,
        ),
        squareCount: sumOf(
            parts.map((part) =>
                grids.get(part.id) === 'squares' ? part.size : 0,
            ),
        ),
    };
};
