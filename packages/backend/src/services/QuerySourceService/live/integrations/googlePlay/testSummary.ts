import { type GooglePlayApiSource } from '@lightdash/common';
import { type LiveTestSummary } from '../../types';
import { getGooglePlayFreshEnd, googlePlayMetricSetSchema } from './run';

// The setup test reads the crash rate metric set and its freshness
export const summarizeGooglePlayTest = (
    body: unknown,
    { packageName }: Pick<GooglePlayApiSource, 'packageName'>,
): LiveTestSummary | null => {
    const parsed = googlePlayMetricSetSchema.safeParse(body);
    if (!parsed.success) return null;
    const freshEnd = getGooglePlayFreshEnd(parsed.data);
    const lastDay = freshEnd
        ? new Date(Date.parse(`${freshEnd}T00:00:00Z`) - 86_400_000)
              .toISOString()
              .slice(0, 10)
        : null;
    return {
        summary: `Connected to ${packageName}`,
        facts: lastDay ? [{ label: 'Daily data through', value: lastDay }] : [],
    };
};
