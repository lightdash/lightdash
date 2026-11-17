import {
    DimensionType,
    FilterOperator,
    getItemMap,
    isAndFilterGroup,
    isDimension,
    isFilterGroup,
    ParameterError,
    type Explore,
    type FilterGroupItem,
    type FilterRule,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import {
    getApiName,
    getLiveExplore,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { getLiveDateRange, toAbsoluteDateRange } from '../../query/dateRange';
import {
    ATTIO_SORT_FIELDS,
    isAttioChoiceProperty,
    parseAttioApiName,
} from './attributes';
import { type AttioRequest, type AttioSort } from './run';

type AttioCondition = Record<string, unknown>;

// Placeholder for the open side of a one-sided date filter; never sent
const EARLIEST_DATE = '1900-01-01';

/** Built-in fields filtered or sorted as Attio's own attributes. */
const BUILT_IN_ATTRIBUTES: Record<string, string> = {
    record_id: 'record_id',
    created_at: 'created_at',
};

const DAY_MS = 86_400_000;

const nextDay = (isoDate: string) =>
    new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + DAY_MS)
        .toISOString()
        .slice(0, 10);

const either = (conditions: AttioCondition[]): AttioCondition =>
    conditions.length === 1 ? conditions[0] : { $or: conditions };

const not = (condition: AttioCondition): AttioCondition => ({
    $not: condition,
});

const toNumber = (value: unknown, label: string) => {
    const number = Number(value);
    if (value === '' || value === null || !Number.isFinite(number)) {
        throw new ParameterError(`${label} must be a number.`);
    }
    return number;
};

/**
 * A date filter as a range of whole UTC days, `[start, end)`. One-sided
 * operators leave the other side open, so future dates still match.
 */
const toDayRange = (
    rule: FilterRule,
    today: string,
): { start?: string; end?: string } => {
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays: 30,
            today,
            earliestDate: EARLIEST_DATE,
        }),
        today,
    );
    switch (rule.operator) {
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return { start: startDate };
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return { end: nextDay(endDate) };
        default:
            return { start: startDate, end: nextDay(endDate) };
    }
};

/** One filter rule as an Attio condition. Expects a rule that passed the shared check. */
const toCondition = ({
    rule,
    apiName,
    type,
    today,
}: {
    rule: FilterRule;
    apiName: string;
    type: DimensionType;
    today: string;
}): AttioCondition => {
    const builtIn = BUILT_IN_ATTRIBUTES[apiName];
    const { slug, property } = builtIn
        ? { slug: builtIn, property: null }
        : parseAttioApiName(apiName);
    const values = rule.values ?? [];
    // Attio filters a value's property by naming it: {name: {full_name: …}}
    const on = (operators: Record<string, unknown>): AttioCondition => ({
        [slug]: property ? { [property]: operators } : operators,
    });
    const each = (operator: string) =>
        either(values.map((value) => on({ [operator]: String(value) })));

    if (type === DimensionType.DATE || type === DimensionType.TIMESTAMP) {
        // created_at is a timestamp in Attio, shown here as a day
        const isTimestamp =
            type === DimensionType.TIMESTAMP || slug === 'created_at';
        const toBound = (date: string) =>
            isTimestamp ? `${date}T00:00:00.000Z` : date;
        const { start, end } = toDayRange(rule, today);
        return on({
            ...(start ? { $gte: toBound(start) } : {}),
            ...(end ? { $lt: toBound(end) } : {}),
        });
    }
    if (type === DimensionType.BOOLEAN) {
        return on({ $eq: String(values[0]) === 'true' });
    }
    if (type === DimensionType.NUMBER) {
        const label = `"${rule.target.fieldId}"`;
        const numbers = values.map((value) => toNumber(value, label));
        const compare = (operator: string) => on({ [operator]: numbers[0] });
        switch (rule.operator) {
            case FilterOperator.EQUALS:
                return either(numbers.map((number) => on({ $eq: number })));
            case FilterOperator.NOT_EQUALS:
                return not(
                    either(numbers.map((number) => on({ $eq: number }))),
                );
            case FilterOperator.GREATER_THAN:
                return compare('$gt');
            case FilterOperator.GREATER_THAN_OR_EQUAL:
                return compare('$gte');
            case FilterOperator.LESS_THAN:
                return compare('$lt');
            case FilterOperator.LESS_THAN_OR_EQUAL:
                return compare('$lte');
            case FilterOperator.IN_BETWEEN:
                if (numbers.length !== 2) {
                    throw new ParameterError(
                        `${label} "between" needs two numbers.`,
                    );
                }
                return on({ $gte: numbers[0], $lte: numbers[1] });
            default:
                break;
        }
    }
    if (isAttioChoiceProperty(property)) {
        // Attio's shorthand matches an option or status by its title
        const titles = either(
            values.map((value) => ({ [slug]: String(value) })),
        );
        return rule.operator === FilterOperator.NOT_EQUALS
            ? not(titles)
            : titles;
    }
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return each('$eq');
        case FilterOperator.NOT_EQUALS:
            return not(each('$eq'));
        case FilterOperator.INCLUDE:
            return each('$contains');
        case FilterOperator.NOT_INCLUDE:
            return not(each('$contains'));
        case FilterOperator.STARTS_WITH:
            return each('$starts_with');
        case FilterOperator.ENDS_WITH:
            return each('$ends_with');
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}" on Attio.`,
            );
    }
};

/** Native sorts when Attio can apply every one; otherwise all of them are ours. */
const toAttioSorts = (
    sorts: SortField[],
    apiName: (fieldId: string) => string,
    typeOf: (fieldId: string) => DimensionType | null,
): { sorts?: AttioSort[]; localSorts: SortField[] } => {
    const native = sorts.map((sort): AttioSort | null => {
        const name = apiName(sort.fieldId);
        const direction = sort.descending ? 'desc' : 'asc';
        if (Object.hasOwn(BUILT_IN_ATTRIBUTES, name)) {
            return { attribute: BUILT_IN_ATTRIBUTES[name], direction };
        }
        if (!typeOf(sort.fieldId)) {
            return null;
        }
        const { slug, property } = parseAttioApiName(name);
        if (property === null) {
            return { attribute: slug, direction };
        }
        return ATTIO_SORT_FIELDS.has(property)
            ? { attribute: slug, field: property, direction }
            : null;
    });
    if (native.length === 0) {
        return { localSorts: [] };
    }
    return native.every((sort): sort is AttioSort => sort !== null)
        ? { sorts: native, localSorts: [] }
        : { localSorts: sorts };
};

/**
 * Compiles a metric query on an Attio explore into one records query.
 * Count and totals group the records we read, so their sorts are ours.
 * `today` is in UTC, the time zone Attio stores timestamps in.
 */
export const compileAttioQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const itemsMap = getItemMap(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    // Built-in grains and web_url have no attribute to sort by
    const typeOf = (fieldId: string): DimensionType | null => {
        const item = itemsMap[fieldId];
        if (!item || !isDimension(item) || item.timeInterval) {
            return null;
        }
        return apiName(fieldId) === 'web_url' ? null : item.type;
    };

    const toGroupCondition = (item: FilterGroupItem): AttioCondition | null => {
        if (isFilterGroup(item)) {
            const items = isAndFilterGroup(item) ? item.and : item.or;
            const conditions = items
                .map(toGroupCondition)
                .filter(
                    (condition): condition is AttioCondition =>
                        condition !== null,
                );
            if (conditions.length <= 1) {
                return conditions[0] ?? null;
            }
            return isAndFilterGroup(item)
                ? { $and: conditions }
                : { $or: conditions };
        }
        if (item.disabled || (item.values ?? []).length === 0) {
            return null;
        }
        const { fieldId } = item.target;
        const field = itemsMap[fieldId];
        return toCondition({
            rule: item,
            apiName: apiName(fieldId),
            type:
                field && isDimension(field) ? field.type : DimensionType.STRING,
            today,
        });
    };
    const filter = metricQuery.filters.dimensions
        ? toGroupCondition(metricQuery.filters.dimensions)
        : null;

    const columns = [...metricQuery.dimensions, ...metricQuery.metrics].map(
        apiName,
    );
    const { sorts, localSorts } =
        metricQuery.metrics.length > 0
            ? { sorts: undefined, localSorts: metricQuery.sorts }
            : toAttioSorts(metricQuery.sorts, apiName, typeOf);
    const request: AttioRequest = {
        columns,
        ...(filter ? { filter } : {}),
        ...(sorts ? { sorts } : {}),
    };
    return { query: JSON.stringify(request), localSorts };
};
