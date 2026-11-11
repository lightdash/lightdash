import {
    preAggregateFallbackReasonLabels,
    preAggregateMissReasonLabels,
    type PreAggregateFallbackReason,
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

export function formatPreAggregateFallbackReason(
    reason: PreAggregateFallbackReason,
): string {
    return preAggregateFallbackReasonLabels[reason] ?? reason;
}

export function formatPreAggregateFallbackTooltip(
    preAggregateName: string,
    reason: PreAggregateFallbackReason,
): string {
    return `Pre-aggregate matched (${preAggregateName}). Served from warehouse: ${formatPreAggregateFallbackReason(reason)}`;
}
