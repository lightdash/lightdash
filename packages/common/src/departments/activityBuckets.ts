import { type ActivityBucket } from '../types/departments';

// A person on Lightdash is healthy with activity in the last 30 days, at risk with activity in the last 90
// days but not the last 30, and lost with none in the last 90 days or none ever
export const HEALTHY_ACTIVITY_DAYS = 30;
export const AT_RISK_ACTIVITY_DAYS = 90;

// Where the healthy and at-risk buckets reach back to; each includes the instant it starts at
export type ActivityBucketStarts = { healthySince: Date; atRiskSince: Date };

const daysBefore = (now: Date, days: number): Date => {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - days);
    return since;
};

// Both measured back from one instant, so every count and every person in a response share the same bounds
export const getActivityBucketStarts = (now: Date): ActivityBucketStarts => ({
    healthySince: daysBefore(now, HEALTHY_ACTIVITY_DAYS),
    atRiskSince: daysBefore(now, AT_RISK_ACTIVITY_DAYS),
});

export const getActivityBucket = (
    lastActiveAt: Date | null,
    starts: ActivityBucketStarts,
): ActivityBucket => {
    if (
        lastActiveAt === null ||
        lastActiveAt.getTime() < starts.atRiskSince.getTime()
    ) {
        return 'lost';
    }
    return lastActiveAt.getTime() >= starts.healthySince.getTime()
        ? 'healthy'
        : 'atRisk';
};
