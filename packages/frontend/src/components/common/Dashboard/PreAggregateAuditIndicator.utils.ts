import {
    preAggregateMissReasonLabels,
    type PreAggregateMatchMiss,
} from '@lightdash/common';

export function formatTileMissReason(
    reason: PreAggregateMatchMiss,
    fieldLabel?: string | null,
): string {
    const label = preAggregateMissReasonLabels[reason.reason] ?? reason.reason;
    if ('fieldId' in reason && reason.fieldId) {
        const fieldDisplay = fieldLabel ?? reason.fieldId;
        return `${label}: ${fieldDisplay}`;
    }
    return label;
}
