import { type WeeklyActivePoint } from '@lightdash/common';
import { formatCount, formatQuantity, WEEKS } from './format';

// Text alternative for the sparkline, built from the same points it draws
export const getSparklineLabel = (points: WeeklyActivePoint[]): string => {
    if (points.length === 0) return 'No weekly activity data';
    const weeks = formatQuantity(points.length, WEEKS);
    if (points.every((point) => point.activeUsers === 0)) {
        return `No activity in the last ${weeks}`;
    }
    const start = formatCount(points[0].activeUsers);
    const soFar = formatCount(points[points.length - 1].activeUsers);
    return `Weekly active users over ${weeks}: ${start} at the start, ${soFar} this week so far`;
};
