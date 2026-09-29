export const AI_CREDIT_HOLD_REASONS = [
    'allowance_exhausted',
    'admin_cap_reached',
    'manual_pause',
    'trial_ended',
] as const;

export type AiCreditHoldReason = (typeof AI_CREDIT_HOLD_REASONS)[number];

export type AiCreditPeriod = {
    periodStart: Date;
    periodEnd: Date;
};

export type AiCreditEntitlement = AiCreditPeriod & {
    uuid: string;
    organizationUuid: string;
    // Null means the organization has no agreed allowance yet.
    allowanceCredits: number | null;
};

export type AiCreditHold = {
    uuid: string;
    organizationUuid: string;
    userUuid: string | null;
    // Set only on the allowance_exhausted hold the usage sink places for an entitlement.
    entitlementUuid: string | null;
    reason: AiCreditHoldReason;
    // For operators only; never shown to customers.
    notes: string | null;
    placedBy: string;
    placedAt: Date;
    expiresAt: Date | null;
    releasedAt: Date | null;
};

// Without an entitlement, usage is reported by UTC calendar month.
export const getCalendarMonthPeriod = (at: Date): AiCreditPeriod => {
    const year = at.getUTCFullYear();
    const month = at.getUTCMonth();
    return {
        periodStart: new Date(Date.UTC(year, month, 1)),
        periodEnd: new Date(Date.UTC(year, month + 1, 1)),
    };
};
