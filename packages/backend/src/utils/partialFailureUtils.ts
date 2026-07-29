import { PartialFailureType, type PartialFailure } from '@lightdash/common';

// Builds "2 charts and 1 query failed to export" from the failure kinds present,
// falling back to a generic "issue(s)" bucket for non-content failure types.
// Shared across Slack/Google Chat/MS Teams — the surrounding markup differs per
// medium, but this phrase is plain text in all three.
export const buildFailureCountPhrase = (failures: PartialFailure[]): string => {
    const chartCount = failures.filter(
        (f) =>
            f.type === PartialFailureType.DASHBOARD_CHART ||
            f.type === PartialFailureType.DASHBOARD_SQL_CHART,
    ).length;
    const queryCount = failures.filter(
        (f) => f.type === PartialFailureType.APP_QUERY,
    ).length;
    const otherCount = failures.length - chartCount - queryCount;

    const parts: string[] = [];
    if (chartCount > 0) {
        parts.push(`${chartCount} chart${chartCount === 1 ? '' : 's'}`);
    }
    if (queryCount > 0) {
        parts.push(`${queryCount} quer${queryCount === 1 ? 'y' : 'ies'}`);
    }
    if (otherCount > 0) {
        parts.push(`${otherCount} issue${otherCount === 1 ? '' : 's'}`);
    }
    return parts.join(' and ');
};
