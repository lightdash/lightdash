import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC } from 'react';
import classes from './ListeningBlocks.module.css';

const COLUMNS = 32;
const ROWS = 10;
const CENTER = COLUMNS / 2;
const BASE_REACH = 13;
const EDGE_CHANCES = [0.45, 0.22, 0.08];
const FILL_CHANCE = 0.88;
const SHADES = ['9', '7', '5', '3', '1'];
const TYPING_STEPS = 24;
const SPARK_ROWS = [7, 8];
const SPARK_SPREAD = 4;

const SHADE_CLASSES: Record<string, string> = {
    '1': classes.shade100,
    '3': classes.shade300,
    '5': classes.shade500,
    '7': classes.shade700,
    '9': classes.shade900,
};

const STAGE_CLASSES = [classes.stage0, classes.stage1, classes.stage2];

const DELAY_CLASSES = [
    classes.delay0,
    classes.delay1,
    classes.delay2,
    classes.delay3,
    classes.delay4,
    classes.delay5,
    classes.delay6,
    classes.delay7,
    classes.delay8,
    classes.delay9,
    classes.delay10,
    classes.delay11,
    classes.delay12,
    classes.delay13,
];

const noise = (row: number, column: number) => {
    let hash = Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

const offsetFromCenter = (column: number) =>
    column < CENTER ? CENTER - 1 - column : column - CENTER;

type Pixel = { shade: string; stage: 0 | 1 | 2 };

const pixelAt = (row: number, column: number): Pixel | null => {
    const reach = BASE_REACH - 2 * row;
    const depth = reach - 1 - offsetFromCenter(column);
    const roll = noise(row, column);

    if (depth < 0) {
        const distance = -depth - 1;
        if (reach < 1 && distance > 0) return null;
        if (roll >= (EDGE_CHANCES[distance] ?? 0)) return null;
        return { shade: distance === 0 ? '7' : '9', stage: 1 };
    }

    if (roll >= FILL_CHANCE) return null;
    const jitter = noise(column, row) < 0.3 ? 1 : 0;
    const shade =
        SHADES[Math.min(4, Math.floor((depth / BASE_REACH) * 6) + jitter)];
    if (depth <= 1) {
        return { shade, stage: noise(row + 7, column) < 0.35 ? 0 : 1 };
    }
    return { shade, stage: 2 };
};

const isSpark = (row: number, column: number) =>
    SPARK_ROWS.includes(row) &&
    offsetFromCenter(column) <= SPARK_SPREAD &&
    noise(row + 11, column) < 0.5;

const clusterKey = (row: number, column: number) =>
    `${Math.floor(row / 2)}-${Math.floor(column / 2)}`;

type Cell = {
    key: string;
    order: number;
    className: string;
    fillClassName: string | null;
};

const buildCells = (): Cell[] => {
    const coords = Array.from({ length: ROWS }, (_, rowIndex) =>
        Array.from({ length: COLUMNS }, (__, column) => {
            const row = ROWS - 1 - rowIndex;
            return { row, column, pixel: pixelAt(row, column) };
        }),
    ).flat();

    const clusters = [
        ...new Set(
            coords
                .filter(({ pixel }) => pixel?.stage === 2)
                .map(({ row, column }) => clusterKey(row, column)),
        ),
    ].sort((a, b) => {
        const [aRow, aColumn] = a.split('-').map(Number);
        const [bRow, bColumn] = b.split('-').map(Number);
        return (
            aRow +
            noise(aRow, aColumn) * 0.9 -
            (bRow + noise(bRow, bColumn) * 0.9)
        );
    });

    return coords.map(({ row, column, pixel }) => {
        const key = `${row}-${column}`;
        if (isSpark(row, column)) {
            return {
                key,
                order: -1,
                className: clsx(
                    classes.spark,
                    DELAY_CLASSES[Math.floor(noise(column, row + 3) * 14)],
                ),
                fillClassName: clsx(classes.fill, classes.sparkFill),
            };
        }
        if (!pixel) {
            return {
                key,
                order: -1,
                className: classes.empty,
                fillClassName: null,
            };
        }
        const rank =
            pixel.stage === 2 ? clusters.indexOf(clusterKey(row, column)) : -1;
        return {
            key,
            order:
                rank < 0
                    ? -1
                    : Math.floor((rank * TYPING_STEPS) / clusters.length),
            className: clsx(
                classes.cell,
                STAGE_CLASSES[pixel.stage],
                DELAY_CLASSES[Math.min(13, row + (column % 2))],
            ),
            fillClassName: clsx(
                classes.fill,
                SHADE_CLASSES[pixel.shade],
                noise(row + 3, column + 5) < 0.06 && classes.striped,
            ),
        };
    });
};

const CELLS = buildCells();

const ListeningBlocks: FC = () => (
    <Box className={classes.cluster} aria-hidden>
        <Box className={classes.grid}>
            {CELLS.map((cell) => (
                <Box
                    key={cell.key}
                    className={cell.className}
                    data-order={cell.order >= 0 ? cell.order : undefined}
                >
                    {cell.fillClassName && (
                        <Box className={cell.fillClassName} />
                    )}
                </Box>
            ))}
        </Box>
    </Box>
);

export default ListeningBlocks;
