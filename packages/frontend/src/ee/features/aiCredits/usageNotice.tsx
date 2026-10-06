import {
    assertUnreachable,
    getAiCreditsPausedMessage,
    type AiCreditHoldReason,
} from '@lightdash/common';
import { type ReactNode } from 'react';
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
    switch (reason) {
        case 'allowance_exhausted':
            return resumesOn === null
                ? 'To keep using AI,'
                : 'To keep using AI before then,';
        case 'admin_cap_reached':
            return 'To raise the cap,';
        case 'manual_pause':
            return 'To resume AI,';
        case 'trial_ended':
            return 'To keep using AI,';
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
            ? 'AI features that use credits are paused'
            : `AI features that use credits are paused until ${resumesOn}`,
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
    title: "This period's allowance is used up",
    body: (
        <>
            {keepsWorking && 'AI keeps working. '}
            {overageCredits !== null &&
                `You're ${overageCredits} credits past the allowance. `}
            {endsOrResets}{' '}
            <AiCreditsContactUs lead="For questions about usage past the allowance," />
        </>
    ),
});
