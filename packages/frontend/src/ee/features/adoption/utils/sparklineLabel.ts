import { type WeeklyActivePoint } from '@lightdash/common';
import { formatCount } from './format';

// Text alternative for the sparkline, built from the same points it draws
export const getSparklineLabel = (points: WeeklyActivePoint[]): string => {
    if (points.length === 0) return 'No weekly activity data';
    const weeks = points.length;
    if (points.every((point) => point.activeUsers === 0)) {
        return `No activity in the last ${weeks} weeks`;
    }
    const start = formatCount(points[0].activeUsers);
    const soFar = formatCount(points[weeks - 1].activeUsers);
    return `Weekly active users over ${weeks} weeks: ${start} at the start, ${soFar} this week so far`;
};
