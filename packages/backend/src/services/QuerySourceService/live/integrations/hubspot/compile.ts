import {
    DimensionType,
    FilterOperator,
    getItemMap,
    isDimension,
    ParameterError,
    UnitOfTime,
    type Explore,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { getLiveDateRange, toAbsoluteDateRange } from '../../query/dateRange';
import {
    HUBSPOT_COUNT_REASON,
    HUBSPOT_MAX_FILTERS,
    toHubspotObject,
} from './explores';
import { type HubspotFilter, type HubspotRequest } from './run';

// Placeholder for the open side of a one-sided date filter; never sent
const EARLIEST_DATE = '1900-01-01';
const DAY_MS = 86_400_000;

const COLUMN_TYPE: Partial<
    Record<
        DimensionType,
        'string' | 'number' | 'boolean' | 'date' | 'timestamp'
    >
> = {
    [DimensionType.STRING]: 'string',
    [DimensionType.NUMBER]: 'number',
    [DimensionType.BOOLEAN]: 'boolean',
    [DimensionType.DATE]: 'date',
    [DimensionType.TIMESTAMP]: 'timestamp',
};

const toEpochMs = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00Z`).getTime();

const NEXT_MONTHS: Partial<Record<UnitOfTime, number>> = {
    [UnitOfTime.months]: 1,
    [UnitOfTime.quarters]: 3,
    [UnitOfTime.years]: 12,
};

/**
 * "In the next" as calendar days from today, both ends included. CRM dates
 * such as a deal's close date are often in the future, unlike analytics APIs.
 */
const getNextDateRange = (rule: FilterRule, today: string) => {
    const count = Number(rule.values?.[0]);
    if (!Number.isInteger(count) || count < 1) {
        throw new ParameterError(
            '"in the next" needs a whole number of at least 1.',
        );
    }
    const settings: { unitOfTime?: UnitOfTime; completed?: boolean } =
        rule.settings ?? {};
    if (settings.completed) {
        throw new ParameterError(
            '"in the next" can\'t use completed periods on HubSpot. Turn off "completed", or use "between".',
        );
    }
    const unit = settings.unitOfTime ?? UnitOfTime.days;
    const date = new Date(`${today}T00:00:00Z`);
    const months = NEXT_MONTHS[unit];
    if (unit === UnitOfTime.days || unit === UnitOfTime.weeks) {
        date.setUTCDate(
            date.getUTCDate() + count * (unit === UnitOfTime.weeks ? 7 : 1),
        );
    } else if (months !== undefined) {
        date.setUTCMonth(date.getUTCMonth() + count * months);
    } else {
        throw new ParameterError(
            `HubSpot filters dates by day, so "in the next" can't use ${unit}.`,
        );
    }
    return { startDate: today, endDate: date.toISOString().slice(0, 10) };
};

/**
 * "In the current" as the whole period, its days still to come included:
 * this month's close dates run to its last day.
 */
const getCurrentDateRange = (rule: FilterRule, today: string) => {
    const { startDate } = toAbsoluteDateRange(
        getLiveDateRange({ rule, defaultDays: 30, today }),
        today,
    );
    const settings: { unitOfTime?: UnitOfTime } = rule.settings ?? {};
    const unit = settings.unitOfTime ?? UnitOfTime.days;
    const end = new Date(`${startDate}T00:00:00Z`);
    const months = NEXT_MONTHS[unit];
    if (unit === UnitOfTime.weeks) {
        end.setUTCDate(end.getUTCDate() + 6);
    } else if (months !== undefined) {
        end.setUTCMonth(end.getUTCMonth() + months, 0);
    }
    return { startDate, endDate: end.toISOString().slice(0, 10) };
};

/** The whole UTC days a date filter covers, both ends included. */
const getDateRange = (rule: FilterRule, today: string) => {
    switch (rule.operator) {
        case FilterOperator.IN_THE_NEXT:
            return getNextDateRange(rule, today);
        case FilterOperator.IN_THE_CURRENT:
            return getCurrentDateRange(rule, today);
        default:
            return toAbsoluteDateRange(
                getLiveDateRange({
                    rule,
                    defaultDays: 30,
                    today,
                    earliestDate: EARLIEST_DATE,
                }),
                today,
            );
    }
};

/**
 * A date filter as epoch milliseconds over whole UTC days, `[start, end)`,
 * which is how HubSpot compares date and datetime properties. One-sided
 * operators leave the other side open.
 */
const toDateFilters = (
    rule: FilterRule,
    propertyName: string,
    today: string,
): HubspotFilter[] => {
    const { startDate, endDate } = getDateRange(rule, today);
    const start = {
        propertyName,
        operator: 'GTE' as const,
        value: String(toEpochMs(startDate)),
    };
    const end = {
        propertyName,
        operator: 'LT' as const,
        value: String(toEpochMs(endDate) + DAY_MS),
    };
    switch (rule.operator) {
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return [start];
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return [end];
        default:
            return [start, end];
    }
};

const toNumberText = (value: unknown, label: string) => {
    const number = Number(value);
    if (value === '' || value === null || !Number.isFinite(number)) {
        throw new ParameterError(`${label} must be a number.`);
    }
    return String(number);
};

/** One value is EQ or NEQ; several are IN or NOT_IN. */
const toMatch = (
    propertyName: string,
    values: string[],
    negate: boolean,
): HubspotFilter =>
    values.length === 1
        ? { propertyName, operator: negate ? 'NEQ' : 'EQ', value: values[0] }
        : { propertyName, operator: negate ? 'NOT_IN' : 'IN', values };

/** One filter rule as HubSpot filters. Expects a rule that passed the shared check. */
const toFilters = ({
    rule,
    propertyName,
    type,
    today,
}: {
    rule: FilterRule;
    propertyName: string;
    type: DimensionType;
    today: string;
}): HubspotFilter[] => {
    const values = rule.values ?? [];
    const label = `"${rule.target.fieldId}"`;
    if (type === DimensionType.DATE || type === DimensionType.TIMESTAMP) {
        return toDateFilters(rule, propertyName, today);
    }
    if (type === DimensionType.BOOLEAN) {
        return [
            {
                propertyName,
                operator: 'EQ',
                value: String(String(values[0]) === 'true'),
            },
        ];
    }
    if (type === DimensionType.NUMBER) {
        const numbers = values.map((value) => toNumberText(value, label));
        const compare = (operator: 'GT' | 'GTE' | 'LT' | 'LTE') => [
            { propertyName, operator, value: numbers[0] },
        ];
        switch (rule.operator) {
            case FilterOperator.EQUALS:
                return [toMatch(propertyName, numbers, false)];
            case FilterOperator.NOT_EQUALS:
                return [toMatch(propertyName, numbers, true)];
            case FilterOperator.GREATER_THAN:
                return compare('GT');
            case FilterOperator.GREATER_THAN_OR_EQUAL:
                return compare('GTE');
            case FilterOperator.LESS_THAN:
                return compare('LT');
            case FilterOperator.LESS_THAN_OR_EQUAL:
                return compare('LTE');
            case FilterOperator.IN_BETWEEN:
                if (numbers.length !== 2) {
                    throw new ParameterError(
                        `${label} "between" needs two numbers.`,
                    );
                }
                return [
                    {
                        propertyName,
                        operator: 'BETWEEN',
                        value: numbers[0],
                        highValue: numbers[1],
                    },
                ];
            default:
                break;
        }
    }
    const texts = values.map(String);
    // HubSpot matches a list of text values only in lowercase
    const choices =
        texts.length > 1 ? texts.map((text) => text.toLowerCase()) : texts;
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return [toMatch(propertyName, choices, false)];
        case FilterOperator.NOT_EQUALS:
            return [toMatch(propertyName, choices, true)];
        // HubSpot matches words; the wildcards let a word match in part
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE: {
            if (texts.length !== 1) {
                throw new ParameterError(
                    `${label} "contains" takes one value on HubSpot.`,
                );
            }
            return [
                {
                    propertyName,
                    operator:
                        rule.operator === FilterOperator.INCLUDE
                            ? 'CONTAINS_TOKEN'
                            : 'NOT_CONTAINS_TOKEN',
                    value: `*${texts[0]}*`,
                },
            ];
        }
        default:
            throw new ParameterError(
                `${label} can't be filtered with "${rule.operator}" on HubSpot.`,
            );
    }
};

/**
 * Compiles a metric query on a HubSpot explore into one search. Filters all
 * have to match (HubSpot's filter group); `today` is in UTC.
 */
export const compileHubspotQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const object = toHubspotObject(getLiveDefinitionName(explore));
    const itemsMap = getItemMap(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const typeOf = (fieldId: string): DimensionType => {
        const item = itemsMap[fieldId];
        return item && isDimension(item) ? item.type : DimensionType.STRING;
    };

    const filters = getActiveFilterRules(
        metricQuery.filters.dimensions,
    ).flatMap((rule) =>
        toFilters({
            rule,
            propertyName: apiName(rule.target.fieldId),
            type: typeOf(rule.target.fieldId),
            today,
        }),
    );

    if (filters.length > HUBSPOT_MAX_FILTERS) {
        throw new ParameterError(
            `HubSpot takes at most ${HUBSPOT_MAX_FILTERS} conditions in one search, and a date range counts as two. These filters make ${filters.length}; remove some.`,
        );
    }

    if (metricQuery.metrics.length > 0) {
        // The shared check only knows the built-in fields, not scanned ones
        if (metricQuery.dimensions.length > 0) {
            throw new ParameterError(HUBSPOT_COUNT_REASON);
        }
        const request: HubspotRequest = {
            kind: 'count',
            object,
            filters,
        };
        return { query: JSON.stringify(request), localSorts: [] };
    }

    if (metricQuery.sorts.length > 1) {
        throw new ParameterError(
            'HubSpot sorts by one field at a time. Keep one sort.',
        );
    }
    const [sort] = metricQuery.sorts;
    const request: HubspotRequest = {
        kind: 'records',
        object,
        columns: metricQuery.dimensions.map((fieldId) => ({
            name: apiName(fieldId),
            type: COLUMN_TYPE[typeOf(fieldId)] ?? 'string',
        })),
        filters,
        ...(sort
            ? {
                  sort: {
                      propertyName: apiName(sort.fieldId),
                      direction: sort.descending ? 'DESCENDING' : 'ASCENDING',
                  },
              }
            : {}),
    };
    return { query: JSON.stringify(request), localSorts: [] };
};
