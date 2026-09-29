export type AiCreditKeyOrigin = 'lightdash-managed' | 'self-managed';

export const AI_CREDIT_HOLD_REASONS = [
    'allowance_exhausted',
    'admin_cap_reached',
    'manual_pause',
    'trial_ended',
] as const;

export type AiCreditHoldReason = (typeof AI_CREDIT_HOLD_REASONS)[number];

const HOLD_REASONS: ReadonlySet<string> = new Set(AI_CREDIT_HOLD_REASONS);

export const isAiCreditHoldReason = (
    value: string,
): value is AiCreditHoldReason => HOLD_REASONS.has(value);

export type AiCreditPeriod = {
    periodStart: Date;
    periodEnd: Date;
};

export type AiCreditEntitlement = AiCreditPeriod & {
    uuid: string;
    organizationUuid: string;
    // Null means the organisation has no agreed allowance yet.
    allowanceCredits: number | null;
};

export type AiCreditHold = {
    uuid: string;
    organizationUuid: string;
    userUuid: string | null;
    reason: AiCreditHoldReason;
    placedBy: string;
    placedAt: Date;
    // Null never expires; an exhausted-allowance hold expires with its window.
    expiresAt: Date | null;
    releasedAt: Date | null;
};

// Without an entitlement, usage is bucketed by UTC calendar month.
export const getCalendarMonthPeriod = (at: Date): AiCreditPeriod => {
    const year = at.getUTCFullYear();
    const month = at.getUTCMonth();
    return {
        periodStart: new Date(Date.UTC(year, month, 1)),
        periodEnd: new Date(Date.UTC(year, month + 1, 1)),
    };
};

export const isWithinPeriod = (at: Date, period: AiCreditPeriod): boolean =>
    at >= period.periodStart && at < period.periodEnd;
