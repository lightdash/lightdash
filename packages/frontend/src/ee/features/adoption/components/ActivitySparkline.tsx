import { type WeeklyActivePoint } from '@lightdash/common';
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
                    <polyline
                        className={styles.line}
                        points={toPolylinePoints(coordinates)}
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
