import {
    assertUnreachable,
    getAiCreditsPausedMessage,
    type AiCreditHoldReason,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import i18n from '../../../i18n/i18n';
import { AiCreditsContactUs } from './AiCreditsContactUs';

export type UsageNoticeSeverity = 'paused' | 'attention';

export type UsageNotice = {
    severity: UsageNoticeSeverity;
    title: string;
    body: ReactNode;
};

const getContactLead = (
    reason: AiCreditHoldReason,
    resumesOn: string | null,
): string => {
    const tr = (key: string) =>
        i18n.t(`aiCredits.contactLead.${key}`, { ns: 'eeMisc' });
    switch (reason) {
        case 'allowance_exhausted':
            return resumesOn === null ? tr('keepUsing') : tr('keepUsingBefore');
        case 'admin_cap_reached':
            return tr('raiseCap');
        case 'manual_pause':
            return tr('resume');
        case 'trial_ended':
            return tr('keepUsing');
        default:
            return assertUnreachable(
                reason,
                `Unknown AI credit hold reason ${reason}`,
            );
    }
};

export const getPausedNotice = (
    reason: AiCreditHoldReason,
    // The date AI comes back on its own, or null when it only comes back on request.
    resumesOn: string | null,
): UsageNotice => ({
    severity: 'paused',
    title:
        resumesOn === null
            ? i18n.t('aiCredits.notice.paused', { ns: 'eeMisc' })
            : i18n.t('aiCredits.notice.pausedUntil', {
                  ns: 'eeMisc',
                  date: resumesOn,
              }),
    body: (
        <>
            {/* The bar already shows the allowance is used up; other reasons need saying. */}
            {reason !== 'allowance_exhausted' &&
                `${getAiCreditsPausedMessage({
                    reason,
                    audience: 'admin',
                    // Admins are already on the AI credits page.
                    settingsUrl: null,
                })} `}
            <AiCreditsContactUs lead={getContactLead(reason, resumesOn)} />
        </>
    ),
});

export const getAllowanceUsedNotice = ({
    keepsWorking,
    overageCredits,
    endsOrResets,
}: {
    keepsWorking: boolean;
    overageCredits: string | null;
    endsOrResets: string;
}): UsageNotice => ({
    severity: 'attention',
    title: i18n.t('aiCredits.notice.allowanceUsed', { ns: 'eeMisc' }),
    body: (
        <>
            {keepsWorking &&
                i18n.t('aiCredits.notice.keepsWorking', { ns: 'eeMisc' })}
            {overageCredits !== null &&
                i18n.t('aiCredits.notice.overage', {
                    ns: 'eeMisc',
                    credits: overageCredits,
                })}
            {endsOrResets}{' '}
            <AiCreditsContactUs
                lead={i18n.t('aiCredits.contactLead.overageQuestions', {
                    ns: 'eeMisc',
                })}
            />
        </>
    ),
});
