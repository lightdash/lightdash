import {
    assertUnreachable,
    MAX_DELIVERY_QUERIES,
    PartialFailureType,
    type PartialFailure,
} from '@lightdash/common';

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
    // APP_QUERY_MISSING counts as a failing query here too, matching how
    // RunDetailsModal tallies it.
    const queryCount = failures.filter(
        (f) =>
            f.type === PartialFailureType.APP_QUERY ||
            f.type === PartialFailureType.APP_QUERY_MISSING,
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

// The email template prints `{{chartName}}: {{error}}`; only some failure kinds
// carry those two fields, so flatten every variant into that shape here.
export const toEmailFailureFields = (
    failure: PartialFailure,
): { chartName: string | undefined; error: string } => {
    switch (failure.type) {
        case PartialFailureType.DASHBOARD_CHART:
        case PartialFailureType.DASHBOARD_SQL_CHART:
            return { chartName: failure.chartName, error: failure.error };
        case PartialFailureType.APP_QUERY:
            return { chartName: failure.label, error: failure.error };
        case PartialFailureType.APP_QUERY_MISSING:
            return {
                chartName: failure.label,
                error: `did not run in this delivery${
                    failure.identityChanged
                        ? ' (query changed since it was selected)'
                        : ''
                }`,
            };
        case PartialFailureType.APP_CAPTURE_OVERFLOW:
            return {
                chartName: undefined,
                error: `${failure.droppedCount} queries were dropped from capture (limit ${MAX_DELIVERY_QUERIES})`,
            };
        case PartialFailureType.AI_AUGMENTATION:
            return {
                chartName: undefined,
                error: `AI summary could not be generated: ${failure.error}`,
            };
        case PartialFailureType.MISSING_TARGETS:
            return {
                chartName: undefined,
                error: 'This delivery has no destinations, so it was disabled',
            };
        default:
            return assertUnreachable(failure, 'Unknown partial failure type');
    }
};
