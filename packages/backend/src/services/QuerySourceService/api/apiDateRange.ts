import {
    FilterOperator,
    isAndFilterGroup,
    isFilterRule,
    ParameterError,
    UnitOfTime,
    type FieldId,
    type FilterGroup,
    type FilterRule,
} from '@lightdash/common';

/** The dates an API query covers, in the API's own timezone. */
export type ApiDateRange =
    | { kind: 'relative'; startDaysAgo: number; endDaysAgo: number }
    | { kind: 'absolute'; startDate: string; endDate: string };

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const toUtcDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (isoDate: string, days: number) =>
    toIsoDate(new Date(toUtcDate(isoDate).getTime() + days * DAY_MS));
const daysBetween = (from: string, to: string) =>
    Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);

/** Today's date in `timeZone`, as YYYY-MM-DD. */
export const getIsoDateInTimeZone = (now: Date, timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);

const toFilterDate = (value: unknown): string => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return toIsoDate(value);
    }
    if (typeof value === 'string' && ISO_DATE.test(value)) {
        return value.slice(0, 10);
    }
    throw new ParameterError(
        `"${String(value)}" isn't a date. Use YYYY-MM-DD.`,
    );
};

/**
 * Takes the filter on `dateFieldId` out of a dimension filter group: the API
 * reads it as its date range, and every other filter stays a filter.
 * Expects a query that passed the shared check.
 */
export const splitDateRangeFilter = (
    group: FilterGroup | undefined,
    dateFieldId: FieldId,
): { dateRule: FilterRule | null; otherFilters: FilterGroup | undefined } => {
    if (!group) {
        return { dateRule: null, otherFilters: undefined };
    }
    // The shared check guarantees one top-level date rule, ANDed with the rest
    const items = (isAndFilterGroup(group) ? group.and : group.or) ?? [];
    const isDateRule = (item: FilterGroup | FilterRule) =>
        isFilterRule(item) &&
        !item.disabled &&
        item.target.fieldId === dateFieldId;
    const dateRules = items.filter(isDateRule).filter(isFilterRule);
    const others = items.filter((item) => !isDateRule(item));
    return {
        dateRule: dateRules[0] ?? null,
        otherFilters:
            others.length === 0 ? undefined : { id: group.id, and: others },
    };
};

const getCompletedPeriod = (
    unit: UnitOfTime,
    count: number,
    today: string,
): ApiDateRange => {
    const date = toUtcDate(today);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const monthStart = (y: number, m: number) =>
        toIsoDate(new Date(Date.UTC(y, m, 1)));
    const getPeriodStarts = (): { current: string; first: string } => {
        switch (unit) {
            case UnitOfTime.weeks: {
                // Weeks start on Monday, as in the rest of the app by default
                const current = addDays(today, -((date.getUTCDay() + 6) % 7));
                return { current, first: addDays(current, -7 * count) };
            }
            case UnitOfTime.months:
                return {
                    current: monthStart(year, month),
                    first: monthStart(year, month - count),
                };
            case UnitOfTime.quarters: {
                const quarterMonth = month - (month % 3);
                return {
                    current: monthStart(year, quarterMonth),
                    first: monthStart(year, quarterMonth - 3 * count),
                };
            }
            case UnitOfTime.years:
                return {
                    current: monthStart(year, 0),
                    first: monthStart(year - count, 0),
                };
            default:
                throw new ParameterError(
                    `Live data sources report by day; filter in days or longer, not ${unit}.`,
                );
        }
    };
    const { current, first } = getPeriodStarts();
    return {
        kind: 'absolute',
        startDate: first,
        endDate: addDays(current, -1),
    };
};

const getPastRange = (rule: FilterRule, today: string): ApiDateRange => {
    const count = Number(rule.values?.[0]);
    if (!Number.isInteger(count) || count < 1) {
        throw new ParameterError(
            '"in the past" needs a whole number of at least 1.',
        );
    }
    const settings: { unitOfTime?: UnitOfTime; completed?: boolean } =
        rule.settings ?? {};
    const unit = settings.unitOfTime ?? UnitOfTime.days;
    if (unit === UnitOfTime.days) {
        return {
            kind: 'relative',
            startDaysAgo: count,
            endDaysAgo: settings.completed ? 1 : 0,
        };
    }
    if (settings.completed) {
        return getCompletedPeriod(unit, count, today);
    }
    const date = toUtcDate(today);
    const getStart = (): string => {
        switch (unit) {
            case UnitOfTime.weeks:
                return addDays(today, -7 * count);
            case UnitOfTime.months:
            case UnitOfTime.quarters:
            case UnitOfTime.years: {
                const months = {
                    [UnitOfTime.months]: count,
                    [UnitOfTime.quarters]: 3 * count,
                    [UnitOfTime.years]: 12 * count,
                }[unit];
                return toIsoDate(
                    new Date(
                        Date.UTC(
                            date.getUTCFullYear(),
                            date.getUTCMonth() - months,
                            date.getUTCDate(),
                        ),
                    ),
                );
            }
            default:
                throw new ParameterError(
                    `Live data sources report by day; filter in days or longer, not ${unit}.`,
                );
        }
    };
    return {
        kind: 'relative',
        startDaysAgo: daysBetween(getStart(), today),
        endDaysAgo: 0,
    };
};

/** The date range a date filter asks for; the last `defaultDays` full days without one. */
export const getApiDateRange = ({
    rule,
    defaultDays,
    today,
}: {
    rule: FilterRule | null;
    defaultDays: number;
    today: string;
}): ApiDateRange => {
    if (!rule) {
        return { kind: 'relative', startDaysAgo: defaultDays, endDaysAgo: 1 };
    }
    const values = rule.values ?? [];
    switch (rule.operator) {
        case FilterOperator.IN_THE_PAST:
            return getPastRange(rule, today);
        case FilterOperator.IN_BETWEEN: {
            const [startDate, endDate] = values.map(toFilterDate);
            if (!startDate || !endDate || startDate > endDate) {
                throw new ParameterError(
                    '"between" needs a start date on or before its end date.',
                );
            }
            return { kind: 'absolute', startDate, endDate };
        }
        case FilterOperator.EQUALS: {
            if (values.length !== 1) {
                throw new ParameterError(
                    'Filter one date with "equals", or a range with "between".',
                );
            }
            const date = toFilterDate(values[0]);
            return { kind: 'absolute', startDate: date, endDate: date };
        }
        default:
            throw new ParameterError(
                `The date can't be filtered with "${rule.operator}". Use "in the past", "between" or "equals".`,
            );
    }
};

/** The range as calendar dates, for APIs without relative dates. */
export const toAbsoluteDateRange = (
    range: ApiDateRange,
    today: string,
): { startDate: string; endDate: string } =>
    range.kind === 'absolute'
        ? { startDate: range.startDate, endDate: range.endDate }
        : {
              startDate: addDays(today, -range.startDaysAgo),
              endDate: addDays(today, -range.endDaysAgo),
          };
