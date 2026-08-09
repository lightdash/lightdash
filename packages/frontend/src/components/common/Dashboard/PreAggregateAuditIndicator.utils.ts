import {
    PreAggregateMissReason,
    preAggregateMissReasonLabels,
    type PreAggregateMatchMiss,
} from '@lightdash/common';

export function getTileMissGuidance(
    reason: PreAggregateMatchMiss,
): string | null {
    if (
        reason.reason ===
        PreAggregateMissReason.REQUIRED_FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE
    ) {
        return 'add this field to the pre-aggregate dimensions';
    }

    return null;
}

export function formatTileMissReason(
    reason: PreAggregateMatchMiss,
    fieldLabel?: string | null,
): string {
    const label = preAggregateMissReasonLabels[reason.reason] ?? reason.reason;
    const guidance = getTileMissGuidance(reason);
    const detail =
        'fieldId' in reason && reason.fieldId
            ? `${label}: ${fieldLabel ?? reason.fieldId}`
            : label;

    return guidance ? `${detail} — ${guidance}` : detail;
}
