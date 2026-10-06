import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export const AI_CREDITS_SUPPORT_EMAIL = 'support@lightdash.com';

const creditFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export const formatCredits = (credits: number): string =>
    creditFormat.format(credits);

const allowanceFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
});

// Allowances are agreed in whole credits, so they drop decimals unless one is set.
export const formatAllowance = (credits: number): string =>
    allowanceFormat.format(credits);

/** Days after today can't have usage yet, so the chart stops at today. */
export const dropFutureDays = <T extends { date: string }>(
    days: T[],
    now: Date,
): T[] => {
    const today = dayjs.utc(now).format('YYYY-MM-DD');
    return days.filter((day) => day.date <= today);
};
