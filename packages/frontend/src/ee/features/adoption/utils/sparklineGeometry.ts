export const SPARKLINE_WIDTH = 110;
export const SPARKLINE_HEIGHT = 30;
const PAD_X = 2;
const PAD_Y = 3;

export type SparklinePoint = { x: number; y: number };

export const hasActivity = (values: number[]): boolean =>
    values.some((value) => value > 0);

// Maps values onto the fixed box, zero on the bottom edge and the peak at the top
export const getSparklinePoints = (values: number[]): SparklinePoint[] => {
    const peak = Math.max(1, ...values);
    const usableWidth = SPARKLINE_WIDTH - 2 * PAD_X;
    const usableHeight = SPARKLINE_HEIGHT - 2 * PAD_Y;
    return values.map((value, index) => ({
        x:
            values.length === 1
                ? SPARKLINE_WIDTH / 2
                : PAD_X + (index * usableWidth) / (values.length - 1),
        y: SPARKLINE_HEIGHT - PAD_Y - (value / peak) * usableHeight,
    }));
};

const round = (value: number): string => String(Math.round(value * 100) / 100);

export const toPolylinePoints = (points: SparklinePoint[]): string =>
    points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');

// Closed shape under the line, for the soft fill
export const toAreaPoints = (points: SparklinePoint[]): string => {
    if (points.length === 0) return '';
    const floor = SPARKLINE_HEIGHT - PAD_Y;
    const first = points[0];
    const last = points[points.length - 1];
    return `${toPolylinePoints(points)} ${round(last.x)},${floor} ${round(first.x)},${floor}`;
};
