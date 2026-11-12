import { type ReactNode } from 'react';
import classes from './MobileUpsell.module.css';

const LINE = 'M2 40L18 35L34 37L50 27L66 29L82 18L98 14L118 6';
const BARS = [42, 30, 19, 11];

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
