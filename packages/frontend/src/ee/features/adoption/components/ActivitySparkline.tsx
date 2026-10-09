import { type WeeklyActivePoint } from '@lightdash/common';
import clsx from 'clsx';
import { useMemo, type FC } from 'react';
import {
    getSparklinePoints,
    hasActivity,
    SPARKLINE_HEIGHT,
    SPARKLINE_WIDTH,
    toAreaPoints,
    toPolylinePoints,
} from '../utils/sparklineGeometry';
import { getSparklineLabel } from '../utils/sparklineLabel';
import styles from './ActivitySparkline.module.css';

const PARTIAL_POINT_RADIUS = 2;

// Drawn by hand in a fixed box so its size never depends on a chart measuring its container
export const ActivitySparkline: FC<{ points: WeeklyActivePoint[] }> = ({
    points,
}) => {
    const values = useMemo(
        () => points.map((point) => point.activeUsers),
        [points],
    );
    const active = hasActivity(values);
    const coordinates = useMemo(() => getSparklinePoints(values), [values]);
    // The last week is still running: it ends the line as a dashed segment and a hollow point
    const complete = coordinates.slice(0, -1);
    const partial = coordinates.slice(-2);
    const current = coordinates[coordinates.length - 1];

    return (
        <svg
            role="img"
            aria-label={getSparklineLabel(points)}
            className={styles.chart}
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            preserveAspectRatio="none"
        >
            {active ? (
                <>
                    <polygon
                        className={styles.area}
                        points={toAreaPoints(coordinates)}
                    />
                    {complete.length > 1 && (
                        <polyline
                            className={styles.line}
                            points={toPolylinePoints(complete)}
                        />
                    )}
                    {partial.length > 1 && (
                        <polyline
                            className={clsx(styles.line, styles.partialLine)}
                            points={toPolylinePoints(partial)}
                        />
                    )}
                    <circle
                        className={styles.partialPoint}
                        cx={current.x}
                        cy={current.y}
                        r={PARTIAL_POINT_RADIUS}
                    />
                </>
            ) : (
                <line
                    className={styles.rule}
                    x1={0}
                    x2={SPARKLINE_WIDTH}
                    y1={SPARKLINE_HEIGHT / 2}
                    y2={SPARKLINE_HEIGHT / 2}
                />
            )}
        </svg>
    );
};
