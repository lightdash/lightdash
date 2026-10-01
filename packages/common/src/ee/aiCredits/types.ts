export const AI_CREDIT_HOLD_REASONS = [
    'allowance_exhausted',
    'admin_cap_reached',
    'manual_pause',
    'trial_ended',
] as const;

export type AiCreditHoldReason = (typeof AI_CREDIT_HOLD_REASONS)[number];

// warn keeps AI available past the allowance; enforce pauses billable AI once it is used up.
export const AI_CREDIT_ALLOWANCE_MODES = ['warn', 'enforce'] as const;

export type AiCreditAllowanceMode = (typeof AI_CREDIT_ALLOWANCE_MODES)[number];

export type AiCreditPeriod = {
    periodStart: Date;
    periodEnd: Date;
};

// Declared once per organization; the allowance resets every resetIntervalMonths from startsAt.
export type AiCreditContract = {
    uuid: string;
    organizationUuid: string;
    startsAt: Date;
    endsAt: Date | null;
    resetIntervalMonths: number;
    // Credits per window. Null means no allowance is agreed yet.
    allowanceCredits: number | null;
    allowanceMode: AiCreditAllowanceMode;
};

export type AiCreditHold = {
    uuid: string;
    organizationUuid: string;
    userUuid: string | null;
    // Set only on the allowance_exhausted hold the usage sink places for a contract window.
    contractUuid: string | null;
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

const daysInUtcMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// Clamps to the last day of shorter months, so a contract starting on the 31st resets on the 30th or 28th.
const addUtcMonths = (anchor: Date, months: number): Date => {
    const target = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1),
    );
    const day = Math.min(
        anchor.getUTCDate(),
        daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth()),
    );
    return new Date(
        Date.UTC(
            target.getUTCFullYear(),
            target.getUTCMonth(),
            day,
            anchor.getUTCHours(),
            anchor.getUTCMinutes(),
            anchor.getUTCSeconds(),
            anchor.getUTCMilliseconds(),
        ),
    );
};

/** The contract window containing the instant, or null outside the contract. */
export const getAiCreditContractWindow = (
    contract: Pick<
        AiCreditContract,
        'startsAt' | 'endsAt' | 'resetIntervalMonths'
    >,
    at: Date,
): AiCreditPeriod | null => {
    const { startsAt, endsAt, resetIntervalMonths } = contract;
    if (at < startsAt || (endsAt !== null && at >= endsAt)) return null;
    const monthsElapsed =
        (at.getUTCFullYear() - startsAt.getUTCFullYear()) * 12 +
        (at.getUTCMonth() - startsAt.getUTCMonth());
    const estimate = Math.floor(monthsElapsed / resetIntervalMonths);
    // The month count overshoots when the instant falls before the anchor's day of month.
    const windowIndex =
        addUtcMonths(startsAt, estimate * resetIntervalMonths) > at
            ? estimate - 1
            : estimate;
    const nextStart = addUtcMonths(
        startsAt,
        (windowIndex + 1) * resetIntervalMonths,
    );
    return {
        periodStart: addUtcMonths(startsAt, windowIndex * resetIntervalMonths),
        periodEnd: endsAt !== null && endsAt < nextStart ? endsAt : nextStart,
    };
};
