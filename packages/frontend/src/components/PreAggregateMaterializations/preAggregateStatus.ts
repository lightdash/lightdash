import {
    type PreAggregateMaterializationStatus,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';

export type PreAggregateStatusKind =
    | 'invalid'
    | 'external'
    | PreAggregateMaterializationStatus
    | 'never_built';

export const PRE_AGGREGATE_STATUS: Record<
    PreAggregateStatusKind,
    { label: string; color: string | undefined }
> = {
    invalid: { label: 'Not valid', color: 'red' },
    external: { label: 'Your own table', color: 'indigo' },
    active: { label: 'Ready', color: 'green' },
    in_progress: { label: 'Building', color: 'yellow' },
    failed: { label: 'Failed', color: 'red' },
    superseded: { label: 'Replaced', color: undefined },
    never_built: { label: 'Not built yet', color: undefined },
};

export const getPreAggregateStatus = (
    summary: PreAggregateMaterializationSummary,
): PreAggregateStatusKind => {
    if (summary.definitionError) return 'invalid';
    if (summary.externalTable) return 'external';
    return summary.materialization?.status ?? 'never_built';
};
