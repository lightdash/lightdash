import { type CSSProperties, type FC } from 'react';
import classes from './PixelField.module.css';

const CELL = 14;
const COLUMNS = 40;
const ROWS = 64;
const REACH = 26;
const MAX_RADIUS = 2.4;

type Dot = { x: number; y: number; radius: number; distance: number };

// Halftone: dots shrink smoothly away from the top-right corner
const DOTS: Dot[] = Array.from({ length: ROWS * COLUMNS }).flatMap(
    (_, index) => {
        const row = Math.floor(index / COLUMNS);
        const column = index % COLUMNS;
        const distance = Math.hypot(COLUMNS - 1 - column, row) / REACH;
        const radius = MAX_RADIUS * Math.max(0, 1 - distance) ** 1.3;
        if (radius < 0.4) return [];
        return [
            {
                x: column * CELL + CELL / 2,
                y: row * CELL + CELL / 2,
                radius,
                distance,
            },
        ];
    },
);

/** Quiet halftone texture for onboarding side panels */
export const PixelField: FC<{ celebrate: boolean }> = ({ celebrate }) => (
    <svg
        className={classes.field}
        data-celebrate={celebrate}
        viewBox={`0 0 ${COLUMNS * CELL} ${ROWS * CELL}`}
        preserveAspectRatio="xMaxYMin slice"
        aria-hidden
    >
        {DOTS.map(({ x, y, radius, distance }) => (
            <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={radius.toFixed(2)}
                style={
                    {
                        '--d': `${(distance * 0.9).toFixed(2)}s`,
                    } as CSSProperties
                }
            />
        ))}
    </svg>
);
