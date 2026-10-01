import {
    isAiCreditHoldBlocking,
    type AiCreditHold,
    type AiCreditUsageSummary,
} from '@lightdash/common';

/** The newest active hold that pauses billable AI, or null when AI keeps working. */
export const findBlockingAiCreditHold = (
    usage: Pick<AiCreditUsageSummary, 'activeHolds' | 'contract'>,
): AiCreditHold | null =>
    usage.activeHolds.find((hold) =>
        isAiCreditHoldBlocking(
            hold.reason,
            usage.contract?.allowanceMode ?? null,
        ),
    ) ?? null;
