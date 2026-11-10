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

/** A calendar date, or a day counted back from today in the API's time zone. */
export type ApiDateBound = { date: string } | { daysAgo: number };

/** The dates an API query covers, both ends included. */
export type ApiDateRange = { start: ApiDateBound; end: ApiDateBound };

const daysAgo = (days: number): ApiDateBound => ({ daysAgo: days });
const onDate = (date: string): ApiDateBound => ({ date });

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

const SUB_DAY_MESSAGE = (unit: UnitOfTime) =>
    `Live data sources report by day; filter in days or longer, not ${unit}.`;

/**
 * The first day of the calendar period `periodsBack` periods before the one
 * holding `today`. Weeks start on Monday, as in the rest of the app by default.
 */
const getPeriodStart = (
    unit: UnitOfTime,
    today: string,
    periodsBack: number,
): string => {
    const date = toUtcDate(today);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const monthStart = (y: number, m: number) =>
        toIsoDate(new Date(Date.UTC(y, m, 1)));
    switch (unit) {
        case UnitOfTime.days:
            return addDays(today, -periodsBack);
        case UnitOfTime.weeks:
            return addDays(
                today,
                -((date.getUTCDay() + 6) % 7) - 7 * periodsBack,
            );
        case UnitOfTime.months:
            return monthStart(year, month - periodsBack);
        case UnitOfTime.quarters:
            return monthStart(year, month - (month % 3) - 3 * periodsBack);
        case UnitOfTime.years:
            return monthStart(year - periodsBack, 0);
        default:
            throw new ParameterError(SUB_DAY_MESSAGE(unit));
    }
};

const getCompletedPeriod = (
    unit: UnitOfTime,
    count: number,
    today: string,
): ApiDateRange => ({
    start: onDate(getPeriodStart(unit, today, count)),
    end: onDate(addDays(getPeriodStart(unit, today, 0), -1)),
});

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
            start: daysAgo(count),
            end: daysAgo(settings.completed ? 1 : 0),
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
                throw new ParameterError(SUB_DAY_MESSAGE(unit));
        }
    };
    return { start: daysAgo(daysBetween(getStart(), today)), end: daysAgo(0) };
};

const getUnit = (rule: FilterRule): UnitOfTime => {
    const settings: { unitOfTime?: UnitOfTime } = rule.settings ?? {};
    return settings.unitOfTime ?? UnitOfTime.days;
};

/** Everything before the range "in the past" names, back to `earliestDate`. */
const getNotPastRange = (
    rule: FilterRule,
    today: string,
    earliestDate: string,
): ApiDateRange => {
    const settings: { completed?: boolean } = rule.settings ?? {};
    if (settings.completed) {
        throw new ParameterError(
            '"not in the past" can\'t exclude completed periods on live data sources: they leave two date ranges. Use "in the past" or "before".',
        );
    }
    const { start } = getPastRange(rule, today);
    return {
        start: onDate(earliestDate),
        end:
            'daysAgo' in start
                ? daysAgo(start.daysAgo + 1)
                : onDate(addDays(start.date, -1)),
    };
};

/**
 * The date range a date filter asks for; the last `defaultDays` full days
 * without one. Open-ended filters such as "after" or "before" start at
 * `earliestDate`, the first day the API reports.
 */
export const getApiDateRange = ({
    rule,
    defaultDays,
    today,
    earliestDate,
}: {
    rule: FilterRule | null;
    defaultDays: number;
    today: string;
    earliestDate?: string;
}): ApiDateRange => {
    if (!rule) {
        return { start: daysAgo(defaultDays), end: daysAgo(1) };
    }
    const values = rule.values ?? [];
    const singleDate = () => {
        if (values.length !== 1) {
            throw new ParameterError(
                `Filter the date with one date for "${rule.operator}", or a range with "between".`,
            );
        }
        return toFilterDate(values[0]);
    };
    const fromEarliest = () => {
        if (!earliestDate) {
            throw new ParameterError(
                `The date can't be filtered with "${rule.operator}" on this source.`,
            );
        }
        return earliestDate;
    };
    switch (rule.operator) {
        case FilterOperator.IN_THE_PAST:
            return getPastRange(rule, today);
        case FilterOperator.NOT_IN_THE_PAST:
            return getNotPastRange(rule, today, fromEarliest());
        case FilterOperator.IN_THE_CURRENT:
            return {
                start: onDate(getPeriodStart(getUnit(rule), today, 0)),
                end: daysAgo(0),
            };
        case FilterOperator.IN_BETWEEN: {
            const [startDate, endDate] = values.map(toFilterDate);
            if (!startDate || !endDate || startDate > endDate) {
                throw new ParameterError(
                    '"between" needs a start date on or before its end date.',
                );
            }
            return { start: onDate(startDate), end: onDate(endDate) };
        }
        case FilterOperator.EQUALS: {
            if (values.length !== 1) {
                throw new ParameterError(
                    'Filter one date with "equals", or a range with "between".',
                );
            }
            const date = toFilterDate(values[0]);
            return { start: onDate(date), end: onDate(date) };
        }
        case FilterOperator.GREATER_THAN:
            return { start: onDate(addDays(singleDate(), 1)), end: daysAgo(0) };
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return { start: onDate(singleDate()), end: daysAgo(0) };
        case FilterOperator.LESS_THAN:
            return {
                start: onDate(fromEarliest()),
                end: onDate(addDays(singleDate(), -1)),
            };
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return { start: onDate(fromEarliest()), end: onDate(singleDate()) };
        default:
            throw new ParameterError(
                `The date can't be filtered with "${rule.operator}". Use "in the past", "between" or "equals".`,
            );
    }
};

/** A bound as a calendar date, for APIs without relative dates. */
export const toAbsoluteDate = (bound: ApiDateBound, today: string): string =>
    'date' in bound ? bound.date : addDays(today, -bound.daysAgo);

/** The range as calendar dates, for APIs without relative dates. */
export const toAbsoluteDateRange = (
    range: ApiDateRange,
    today: string,
): { startDate: string; endDate: string } => ({
    startDate: toAbsoluteDate(range.start, today),
    endDate: toAbsoluteDate(range.end, today),
});

/**
 * The calendar dates a query covers, and the filters left once its date is
 * taken out, for APIs that take one absolute range.
 */
export const resolveAbsoluteDateRange = ({
    dateRange,
    filters,
    today,
}: {
    dateRange: { fieldId: FieldId; defaultDays: number } | undefined;
    filters: FilterGroup | undefined;
    today: string;
}): {
    startDate: string;
    endDate: string;
    otherFilters: FilterGroup | undefined;
} => {
    const { dateRule, otherFilters } = dateRange
        ? splitDateRangeFilter(filters, dateRange.fieldId)
        : { dateRule: null, otherFilters: filters };
    return {
        ...toAbsoluteDateRange(
            getApiDateRange({
                rule: dateRule,
                defaultDays: dateRange?.defaultDays ?? 30,
                today,
            }),
            today,
        ),
        otherFilters,
    };
};
