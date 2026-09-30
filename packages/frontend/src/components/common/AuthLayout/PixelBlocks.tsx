import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { type FC } from 'react';
import classes from './PixelBlocks.module.css';

const PATTERN = ['......g', '.....9.', '....5.1', '...9g35'];

const STRIPED = new Set(['2-6', '3-5']);

const SHADE_CLASSES: Record<string, string> = {
    g: classes.shadeDim,
    '1': classes.shade100,
    '3': classes.shade300,
    '5': classes.shade500,
    '7': classes.shade700,
    '9': classes.shade900,
};

const DELAY_CLASSES = [
    classes.delay0,
    classes.delay1,
    classes.delay2,
    classes.delay3,
    classes.delay4,
    classes.delay5,
    classes.delay6,
];

const lastRow = PATTERN.length - 1;
const lastColumn = PATTERN[0].length - 1;

const CELLS = PATTERN.flatMap((row, rowIndex) =>
    row.split('').map((shade, columnIndex) => {
        const key = `${rowIndex}-${columnIndex}`;
        const distance = lastRow - rowIndex + (lastColumn - columnIndex);
        return {
            key,
            className:
                shade === '.'
                    ? classes.empty
                    : clsx(
                          classes.block,
                          SHADE_CLASSES[shade],
                          STRIPED.has(key) && classes.striped,
                          DELAY_CLASSES[Math.floor(distance / 2)],
                      ),
        };
    }),
);

const PixelBlocks: FC = () => (
    <Box className={classes.grid} aria-hidden>
        {CELLS.map((cell) => (
            <Box key={cell.key} className={cell.className} />
        ))}
    </Box>
);

export default PixelBlocks;
