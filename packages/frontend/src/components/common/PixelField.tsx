import { type CSSProperties, type FC } from 'react';
import classes from './PixelField.module.css';

const CELL = 14;
const COLUMNS = 40;
const ROWS = 64;
const REACH = 26;
const BLOCK = 10;

type Block = { x: number; y: number; alpha: number; distance: number };

// Pixel blocks fade out away from the top-right corner
const BLOCKS: Block[] = Array.from({ length: ROWS * COLUMNS }).flatMap(
    (_, index) => {
        const row = Math.floor(index / COLUMNS);
        const column = index % COLUMNS;
        const distance = Math.hypot(COLUMNS - 1 - column, row) / REACH;
        const alpha = Math.max(0, 1 - distance) ** 1.6;
        if (alpha < 0.04) return [];
        return [
            {
                x: column * CELL + (CELL - BLOCK) / 2,
                y: row * CELL + (CELL - BLOCK) / 2,
                alpha,
                distance,
            },
        ];
    },
);

/** Quiet pixel texture for onboarding side panels */
export const PixelField: FC<{ celebrate: boolean }> = ({ celebrate }) => (
    <svg
        className={classes.field}
        data-celebrate={celebrate}
        viewBox={`0 0 ${COLUMNS * CELL} ${ROWS * CELL}`}
        preserveAspectRatio="xMaxYMin slice"
        shapeRendering="crispEdges"
        aria-hidden
    >
        {BLOCKS.map(({ x, y, alpha, distance }) => (
            <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={BLOCK}
                height={BLOCK}
                fillOpacity={alpha.toFixed(2)}
                style={
                    {
                        '--d': `${(distance * 0.9).toFixed(2)}s`,
                    } as CSSProperties
                }
            />
        ))}
    </svg>
);
