import { type ActivityBucket } from '../types/departments';

// A person on Lightdash is healthy with activity in the last 30 days, at risk with activity in the last 90
// days but not the last 30, and lost with none in the last 90 days or none ever
export const HEALTHY_ACTIVITY_DAYS = 30;
export const AT_RISK_ACTIVITY_DAYS = 90;

// Where the healthy and at-risk buckets start, each including its first instant. A person's last activity is
// read back to lastActiveSince and no further, so every read in a request shares these two
export type ActivityWindows = { activeSince: Date; lastActiveSince: Date };

const daysBefore = (now: Date, days: number): Date => {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - days);
    return since;
};

// Both measured back from one instant, so every count and every person in a response share the same bounds
export const getActivityWindows = (
    now: Date = new Date(),
): ActivityWindows => ({
    activeSince: daysBefore(now, HEALTHY_ACTIVITY_DAYS),
    lastActiveSince: daysBefore(now, AT_RISK_ACTIVITY_DAYS),
});

export const getActivityBucket = (
    lastActiveAt: Date | null,
    windows: ActivityWindows,
): ActivityBucket => {
    if (
        lastActiveAt === null ||
        lastActiveAt.getTime() < windows.lastActiveSince.getTime()
    ) {
        return 'lost';
    }
    return lastActiveAt.getTime() >= windows.activeSince.getTime()
        ? 'healthy'
        : 'atRisk';
};
