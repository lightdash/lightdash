import {
    FilterOperator,
    isAndFilterGroup,
    isOrFilterGroup,
    UnitOfTime,
    type FilterGroupItem,
    type Filters,
} from '@lightdash/common';

type Interval = { start: number; end: number };
export type RequestedDatePeriod =
    | { kind: 'calendar'; start: string; end: string }
    | {
          kind: 'relative';
          operator: FilterOperator.IN_THE_PAST | FilterOperator.IN_THE_CURRENT;
          count: number;
          unit: UnitOfTime;
          completed: boolean | null;
      };

export type DatePeriodCandidate = {
    text: string;
    period: RequestedDatePeriod;
};

const DAY = 86_400_000;
const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];
const dayNumber = (value: unknown): number | null => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(time) &&
        new Date(time).toISOString().slice(0, 10) === value
        ? time / DAY
        : null;
};
const dateString = (day: number): string =>
    new Date(day * DAY).toISOString().slice(0, 10);

/** Extract literal candidates only. A separate closed choice establishes their
 * role in the request; numbers and quoted examples are not automatically dates. */
export const getDatePeriodCandidates = (
    text: string,
): DatePeriodCandidate[] => {
    if (text.length > 8_000) return [];
    const candidates: DatePeriodCandidate[] = [];
    const occupied: { start: number; end: number }[] = [];
    const add = (match: RegExpMatchArray, period: RequestedDatePeriod) => {
        const start = match.index!;
        const end = start + match[0].length;
        if (occupied.some((span) => start < span.end && end > span.start))
            return;
        occupied.push({ start, end });
        candidates.push({ text: match[0], period });
    };
    for (const match of text.matchAll(
        /\b(?:from\s+)?(\d{4}-\d{2}-\d{2})\s+(?:through|to)\s+(\d{4}-\d{2}-\d{2})(?:\s+inclusive)?\b/gi,
    )) {
        const start = dayNumber(match[1]);
        const end = dayNumber(match[2]);
        if (start !== null && end !== null && start <= end)
            add(match, { kind: 'calendar', start: match[1], end: match[2] });
        else
            occupied.push({
                start: match.index!,
                end: match.index! + match[0].length,
            });
    }
    for (const match of text.matchAll(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi,
    )) {
        const month = months.indexOf(match[1].toLowerCase());
        const year = Number(match[2]);
        if (year >= 1000 && year <= 9998)
            add(match, {
                kind: 'calendar',
                start: dateString(Date.UTC(year, month, 1) / DAY),
                end: dateString(Date.UTC(year, month + 1, 1) / DAY - 1),
            });
    }
    for (const match of text.matchAll(
        /\b(?:in|during|for)\s+(?:the\s+)?(?:calendar\s+year\s+)?(\d{4})\b(?!-)/gi,
    )) {
        const year = Number(match[1]);
        if (year >= 1000 && year <= 9998)
            add(match, {
                kind: 'calendar',
                start: `${year}-01-01`,
                end: `${year}-12-31`,
            });
    }
    for (const match of text.matchAll(
        /\b(\d{4}-\d{2}-\d{2})\b(?![T\d:+-]|\s+\d{2}:)/g,
    )) {
        if (dayNumber(match[1]) !== null)
            add(match, { kind: 'calendar', start: match[1], end: match[1] });
    }
    for (const match of text.matchAll(
        /\b(last|past|this|current)\s+(?:(\d+)\s+)?(?:(complete|completed|rolling)\s+)?(day|week|month|quarter|year)s?\b/gi,
    )) {
        const count = Number(match[2] ?? 1);
        const current = /^(this|current)$/i.test(match[1]);
        if (
            Number.isSafeInteger(count) &&
            count >= 1 &&
            count <= 10_000 &&
            (!current || count === 1)
        ) {
            let completed: boolean | null = null;
            if (current) completed = false;
            else if (match[3]) completed = match[3].toLowerCase() !== 'rolling';
            else if (
                !match[2] &&
                match[1].toLowerCase() === 'last' &&
                match[4].toLowerCase() !== 'day'
            )
                completed = true;
            add(match, {
                kind: 'relative',
                operator: current
                    ? FilterOperator.IN_THE_CURRENT
                    : FilterOperator.IN_THE_PAST,
                count,
                unit: `${match[4].toLowerCase()}s` as UnitOfTime,
                completed,
            });
        }
    }
    return candidates.length <= 12 ? candidates : [];
};

const normalize = (ranges: Interval[]): Interval[] => {
    const result: Interval[] = [];
    for (const range of ranges
        .filter(({ start, end }) => start <= end)
        .sort((a, b) => a.start - b.start)) {
        const last = result.at(-1);
        if (last && range.start <= last.end + 1)
            last.end = Math.max(last.end, range.end);
        else result.push({ ...range });
    }
    return result;
};
const intersect = (left: Interval[], right: Interval[]): Interval[] =>
    normalize(
        left.flatMap((a) =>
            right.map((b) => ({
                start: Math.max(a.start, b.start),
                end: Math.min(a.end, b.end),
            })),
        ),
    );
const universe: Interval[] = [{ start: -Infinity, end: Infinity }];

type Projection = { ranges: Interval[]; constrained: boolean };
const projectCalendarFilters = (
    item: FilterGroupItem,
    fieldId: string,
    depth = 0,
): Projection | null => {
    if (depth > 20) return null;
    if (isAndFilterGroup(item) || isOrFilterGroup(item)) {
        const and = isAndFilterGroup(item);
        const children = (isAndFilterGroup(item) ? item.and : item.or).map(
            (child) => projectCalendarFilters(child, fieldId, depth + 1),
        );
        if (children.some((child) => child === null)) return null;
        const projections = children as Projection[];
        // A different field inside OR changes which rows bypass the date rule.
        if (!and && projections.some((child) => !child.constrained))
            return null;
        return {
            ranges: and
                ? projections.reduce(
                      (ranges, child) => intersect(ranges, child.ranges),
                      universe,
                  )
                : normalize(projections.flatMap((child) => child.ranges)),
            constrained: projections.some((child) => child.constrained),
        };
    }
    if (item.disabled || item.target.fieldId !== fieldId)
        return { ranges: universe, constrained: false };
    const values = (item.values ?? []).map(dayNumber);
    if (!values.length || values.some((value) => value === null)) return null;
    const days = values as number[];
    const start = days[0];
    let ranges: Interval[];
    switch (item.operator) {
        case FilterOperator.EQUALS:
            ranges = days.map((day) => ({ start: day, end: day }));
            break;
        case FilterOperator.IN_BETWEEN:
            if (days.length !== 2) return null;
            ranges = [{ start, end: days[1] }];
            break;
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            if (days.length !== 1) return null;
            ranges = [
                {
                    start:
                        start +
                        (item.operator === FilterOperator.GREATER_THAN ? 1 : 0),
                    end: Infinity,
                },
            ];
            break;
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            if (days.length !== 1) return null;
            ranges = [
                {
                    start: -Infinity,
                    end:
                        start -
                        (item.operator === FilterOperator.LESS_THAN ? 1 : 0),
                },
            ];
            break;
        default:
            return null;
    }
    return { ranges: normalize(ranges), constrained: true };
};

const getConjunctiveRules = (
    item: FilterGroupItem,
    depth = 0,
): FilterGroupItem[] | null => {
    if (depth > 20 || isOrFilterGroup(item)) return null;
    if (!isAndFilterGroup(item)) return [item];
    const groups = item.and.map((child) =>
        getConjunctiveRules(child, depth + 1),
    );
    return groups.some((group) => group === null)
        ? null
        : (groups.flat() as FilterGroupItem[]);
};

export const compareDatePeriod = ({
    period,
    filters,
    fieldId,
    calendarDate,
}: {
    period: RequestedDatePeriod;
    filters: Filters;
    fieldId: string;
    calendarDate: boolean;
}): 'match' | 'mismatch' | 'unknown' => {
    if (period.kind === 'calendar') {
        if (!calendarDate) return 'unknown';
        const start = dayNumber(period.start);
        const end = dayNumber(period.end);
        if (start === null || end === null || start > end) return 'unknown';
        const projection = filters.dimensions
            ? projectCalendarFilters(filters.dimensions, fieldId)
            : { ranges: universe, constrained: false };
        if (!projection) return 'unknown';
        return projection.ranges.length === 1 &&
            projection.ranges[0].start === start &&
            projection.ranges[0].end === end
            ? 'match'
            : 'mismatch';
    }
    const rules = filters.dimensions
        ? getConjunctiveRules(filters.dimensions)
        : [];
    if (!rules) return 'unknown';
    const matching = rules.filter(
        (rule) =>
            !isAndFilterGroup(rule) &&
            !isOrFilterGroup(rule) &&
            !rule.disabled &&
            rule.target.fieldId === fieldId,
    );
    if (matching.length === 0) return 'mismatch';
    if (matching.length !== 1) return 'unknown';
    const rule = matching[0];
    if (isAndFilterGroup(rule) || isOrFilterGroup(rule)) return 'unknown';
    if (
        rule.operator !== FilterOperator.IN_THE_CURRENT &&
        rule.operator !== FilterOperator.IN_THE_PAST
    )
        return 'unknown';
    const count = rule.values?.[0];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1)
        return 'unknown';
    const unit = rule.settings?.unitOfTime ?? UnitOfTime.days;
    const completed = !!rule.settings?.completed;
    return rule.operator === period.operator &&
        (period.operator === FilterOperator.IN_THE_CURRENT ||
            count === period.count) &&
        unit === period.unit &&
        (period.operator === FilterOperator.IN_THE_CURRENT ||
            period.completed === null ||
            completed === period.completed)
        ? 'match'
        : 'mismatch';
};
