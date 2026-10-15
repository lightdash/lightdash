import {
    preAggregateMissReasonLabels,
    type PreAggregateMatchMiss,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export function formatTileMissReason(
    reason: PreAggregateMatchMiss,
    fieldLabel?: string | null,
): string {
    const label = preAggregateMissReasonLabels[reason.reason] ?? reason.reason;
    if ('fieldId' in reason && reason.fieldId) {
        const fieldDisplay = fieldLabel ?? reason.fieldId;
        return i18n.t('dashboard.preAggAudit.reasonWithFieldText', {
            ns: 'modals',
            reason: label,
            field: fieldDisplay,
        });
    }
    return label;
}
