import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC } from 'react';
import classes from './ListeningBlocks.module.css';

const SHADES = [
    '.......9',
    '......9.',
    '.....975',
    '....9.53',
    '...97531',
    '..9.5.35',
    '.97535.1',
];

const STAGES = [
    '.......1',
    '......0.',
    '.....122',
    '....1.22',
    '...02222',
    '..0.2.22',
    '.01222.2',
];

const SHADE_CLASSES: Record<string, string> = {
    '1': classes.shade100,
    '3': classes.shade300,
    '5': classes.shade500,
    '7': classes.shade700,
    '9': classes.shade900,
};

const STRIPED = new Set(['2-7', '4-6', '6-4']);

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

const TYPING_ORDER = SHADES.flatMap((row, rowIndex) =>
    row
        .split('')
        .map((shade, columnIndex) => ({ shade, rowIndex, columnIndex }))
        .filter(
            ({ shade, rowIndex: r, columnIndex: c }) =>
                shade !== '.' && STAGES[r][c] === '2',
        ),
)
    .sort((a, b) => b.rowIndex + b.columnIndex - (a.rowIndex + a.columnIndex))
    .map(({ rowIndex, columnIndex }) => `${rowIndex}-${columnIndex}`);

const CELLS = SHADES.flatMap((row, rowIndex) =>
    row.split('').map((shade, columnIndex) => {
        const key = `${rowIndex}-${columnIndex}`;
        if (shade === '.') return { key, order: -1, className: classes.empty };
        const stage = Number(STAGES[rowIndex][columnIndex]);
        return {
            key,
            order: TYPING_ORDER.indexOf(key),
            className: clsx(
                classes.cell,
                STAGE_CLASSES[stage],
                DELAY_CLASSES[rowIndex + columnIndex],
            ),
            fillClassName: clsx(
                classes.fill,
                SHADE_CLASSES[shade],
                STRIPED.has(key) && classes.striped,
            ),
        };
    }),
);

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
