import { type CSSProperties, type ReactNode } from 'react';
import classes from './MobileUpsell.module.css';

const LINE = 'M2 40L18 35L34 37L50 27L66 29L82 18L98 14L118 6';
const BARS = [42, 30, 19, 11];

const PYRAMID_COLUMNS = 40;
const PYRAMID_ROWS = 5;
const PYRAMID_CELL = 10;
const SHADES = ['#08004d', '#1200b2', '#5e4cff', '#a499ff', '#d1ccff'];

const noise = (row: number, column: number) => {
    let hash = Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

const PYRAMID_SIZE = PYRAMID_ROWS * PYRAMID_COLUMNS;

const PYRAMID = Array.from({ length: PYRAMID_SIZE }, (_, index) => {
    const row = Math.floor(index / PYRAMID_COLUMNS);
    const column = index % PYRAMID_COLUMNS;
    const fromCenter = Math.abs(column + 0.5 - PYRAMID_COLUMNS / 2);
    const depth = 15 - row * 3 - fromCenter;
    if (depth < 0 || noise(row, column) > 0.9) return [];
    const shade = Math.min(4, Math.floor((depth / 15) * 5));
    const wave = row * 90 + Math.round(noise(column, row) * 120);
    return [
        {
            key: `${row}-${column}`,
            x: column * PYRAMID_CELL,
            y: (PYRAMID_ROWS - 1 - row) * PYRAMID_CELL,
            fill: SHADES[shade],
            delay: `${wave}ms`,
        },
    ];
}).flat();

const PYRAMID_BOX = `0 0 ${PYRAMID_COLUMNS * PYRAMID_CELL} ${PYRAMID_ROWS * PYRAMID_CELL}`;

export const PixelPyramid = ({ className }: { className?: string }) => (
    <svg
        viewBox={PYRAMID_BOX}
        className={`${classes.pyramid} ${className ?? ''}`}
        shapeRendering="crispEdges"
    >
        {PYRAMID.map(({ key, x, y, fill, delay }) => (
            <rect
                key={key}
                x={x}
                y={y}
                width={PYRAMID_CELL - 1}
                height={PYRAMID_CELL - 1}
                fill={fill}
                style={{ '--d': delay } as CSSProperties}
            />
        ))}
    </svg>
);

const PIXEL_BARS = [6, 4, 5, 3, 2];

export const PixelBars = () => (
    <svg
        viewBox="0 0 69 41"
        className={classes.pixelBars}
        shapeRendering="crispEdges"
    >
        {PIXEL_BARS.flatMap((height, bar) =>
            Array.from({ length: height }, (_, level) => (
                <rect
                    key={`${bar}-${level}`}
                    x={bar * 14}
                    y={34 - level * 7}
                    width={13}
                    height={6}
                    fill={level === height - 1 ? '#d1ccff' : '#5e4cff'}
                    style={
                        {
                            '--d': `${1400 + level * 110 + bar * 60}ms`,
                        } as CSSProperties
                    }
                />
            )),
        )}
    </svg>
);

export const LineChart = ({ stretch = false }: { stretch?: boolean }) => (
    <svg
        viewBox="0 0 120 48"
        preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}
        className={classes.chart}
        data-stretch={stretch}
    >
        <path d="M0 47.5H120" className={classes.axis} />
        <path d={`${LINE}V47H2Z`} className={classes.area} />
        <path d={LINE} pathLength={1} className={classes.line} />
    </svg>
);

export const BarChart = () => (
    <svg viewBox="0 0 120 48" className={classes.chart}>
        <path d="M0 47.5H120" className={classes.axis} />
        <g className={classes.bars}>
            {BARS.map((height, index) => (
                <rect
                    key={height}
                    x={8 + index * 28}
                    y={48 - height}
                    width={20}
                    height={height}
                    rx={2}
                />
            ))}
        </g>
    </svg>
);

export const Spark = () => (
    <svg viewBox="0 0 28 10" className={classes.spark}>
        <path d="M1 8L6 6L11 7L16 4L21 5L27 2" pathLength={1} />
    </svg>
);

export const Phone = ({
    className,
    cutout = 'pill',
    children,
}: {
    className: string;
    cutout?: 'pill' | 'dot';
    children: ReactNode;
}) => (
    <div className={`${classes.phone} ${className}`} data-cutout={cutout}>
        {children}
    </div>
);

export const Window = ({
    className,
    children,
}: {
    className: string;
    children: ReactNode;
}) => (
    <div className={`${classes.window} ${className}`}>
        <div className={classes.windowBar}>
            <i />
            <i />
            <i />
        </div>
        {children}
    </div>
);

export const Tile = ({
    title,
    children,
    className,
}: {
    title: string;
    children: ReactNode;
    className?: string;
}) => (
    <div className={`${classes.tile} ${className ?? ''}`}>
        <span>{title}</span>
        {children}
    </div>
);
