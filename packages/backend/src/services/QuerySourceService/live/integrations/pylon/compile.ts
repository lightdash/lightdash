import {
    FilterOperator,
    ParameterError,
    type Explore,
    type FilterRule,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import {
    getActiveFilterRules,
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    type LiveCompiledRequest,
} from '../../explores/definition';
import {
    getLiveDateRange,
    splitDateRangeFilter,
    toAbsoluteDateRange,
} from '../../query/dateRange';
import {
    type PylonFilter,
    type PylonFilterLeaf,
    type PylonRequest,
} from './run';

/** Before Pylon existed, for open-ended date filters. */
const PYLON_EARLIEST_DATE = '2021-01-01';

type PylonKind = PylonRequest['kind'];

/** Each field's name in Pylon's search filters, where it differs. */
const FILTER_FIELDS: Record<PylonKind, Record<string, string>> = {
    issues: {
        title: 'subject',
        type: 'issue_type',
        assignee_email: 'assignee_email',
        resolved_at: 'resolved_at',
        first_response_minutes: 'time_to_first_response',
        touches: 'number_of_touches',
    },
    accounts: {
        id: 'account_id',
        domain: 'domains',
        last_customer_activity_at: 'last_customer_activity_at',
    },
    contacts: {},
};

/** Fields whose "is empty" filter is on the ID Pylon stores. */
const SET_FILTER_FIELDS: Record<string, string> = {
    assignee_email: 'assignee_id',
};

const SORT_FIELDS: Record<PylonKind, Record<string, string>> = {
    issues: { created_at: 'created_at', updated_at: 'updated_at' },
    accounts: {
        name: 'name',
        created_at: 'created_at',
        last_customer_activity_at: 'last_customer_activity_at',
    },
    contacts: {},
};

const DATE_FIELDS = new Set([
    'created_at',
    'updated_at',
    'resolved_at',
    'last_customer_activity_at',
    'last_vendor_activity_at',
]);

const addDay = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
};

/** Whole UTC days, as Pylon's [start, end) time range. */
const toTimeRange = (
    field: string,
    rule: FilterRule | null,
    { today, defaultDays }: { today: string; defaultDays: number },
): PylonFilterLeaf => {
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays,
            today,
            earliestDate: PYLON_EARLIEST_DATE,
        }),
        today,
    );
    return {
        field,
        operator: 'time_range',
        values: [`${startDate}T00:00:00Z`, `${addDay(endDate)}T00:00:00Z`],
    };
};

const toNumber = (value: unknown, label: string) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new ParameterError(`${label} must be a number of 0 or more.`);
    }
    return number;
};

/** Several values of a one-value operator: any of them, or none of them. */
const anyOrNone = (
    leaves: PylonFilterLeaf[],
    isNegative: boolean,
): PylonFilter =>
    leaves.length === 1
        ? leaves[0]
        : { operator: isNegative ? 'and' : 'or', subfilters: leaves };

/** One Pylon filter per rule. Expects a query that passed the shared check. */
const toPylonFilter = (
    kind: PylonKind,
    apiName: string,
    rule: FilterRule,
    today: string,
): PylonFilter => {
    const values = (rule.values ?? []).map(String);
    if (DATE_FIELDS.has(apiName)) {
        return toTimeRange(FILTER_FIELDS[kind][apiName] ?? apiName, rule, {
            today,
            defaultDays: 30,
        });
    }
    const field = FILTER_FIELDS[kind][apiName] ?? apiName;
    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS: {
            const isNegative = rule.operator === FilterOperator.NOT_EQUALS;
            if (apiName === 'touches') {
                return anyOrNone(
                    values.map((value) => ({
                        field,
                        operator: 'equals',
                        value: String(toNumber(value, 'Touches')),
                    })),
                    false,
                );
            }
            return {
                field,
                operator: isNegative ? 'not_in' : 'in',
                values: values.map((value) => value.trim()),
            };
        }
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE: {
            const isNegative = rule.operator === FilterOperator.NOT_INCLUDE;
            return anyOrNone(
                values.map((value) => ({
                    field,
                    operator: isNegative
                        ? 'string_does_not_contain'
                        : 'string_contains',
                    value,
                })),
                isNegative,
            );
        }
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return {
                field: SET_FILTER_FIELDS[apiName] ?? field,
                operator:
                    rule.operator === FilterOperator.NULL
                        ? 'is_unset'
                        : 'is_set',
            };
        case FilterOperator.GREATER_THAN:
        case FilterOperator.LESS_THAN: {
            const [value] = values;
            const number =
                apiName === 'first_response_minutes'
                    ? Math.round(toNumber(value, 'First response') * 60)
                    : toNumber(value, 'Touches');
            return {
                field,
                operator:
                    rule.operator === FilterOperator.GREATER_THAN
                        ? 'greater_than'
                        : 'less_than',
                value: String(number),
            };
        }
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't use "${rule.operator}" on Pylon.`,
            );
    }
};

/** Pylon sorts by one field it knows; any other order is ours. */
const toSort = (
    kind: PylonKind,
    sorts: SortField[],
    apiName: (fieldId: string) => string,
): Pick<PylonRequest, 'sort'> & { localSorts: SortField[] } => {
    const [first, ...others] = sorts;
    if (!first) {
        return kind === 'issues'
            ? { sort: { field: 'created_at', order: 'desc' }, localSorts: [] }
            : { localSorts: [] };
    }
    const field =
        others.length === 0
            ? SORT_FIELDS[kind][apiName(first.fieldId)]
            : undefined;
    return field
        ? {
              sort: { field, order: first.descending ? 'desc' : 'asc' },
              localSorts: [],
          }
        : { localSorts: sorts };
};

const toKind = (explore: Explore): PylonKind => {
    const name = getLiveDefinitionName(explore);
    if (name === 'issues' || name === 'accounts' || name === 'contacts') {
        return name;
    }
    throw new ParameterError(`"${explore.name}" isn't a Pylon explore.`);
};

/**
 * Compiles a metric query on a Pylon explore into one search. Issues always
 * search a range of creation days, the last 30 without a Created filter.
 * `today` is in UTC, the time zone Pylon reports in.
 */
export const compilePylonQuery = ({
    explore,
    metricQuery,
    today,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    today: string;
}): LiveCompiledRequest => {
    const kind = toKind(explore);
    const apiSource = getLiveExplore(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const { dateRange } = apiSource;
    const { dateRule, otherFilters } = dateRange
        ? splitDateRangeFilter(
              metricQuery.filters.dimensions,
              dateRange.fieldId,
          )
        : { dateRule: null, otherFilters: metricQuery.filters.dimensions };
    const filters: PylonFilter[] = [
        ...(dateRange
            ? [
                  toTimeRange(apiName(dateRange.fieldId), dateRule, {
                      today,
                      defaultDays: dateRange.defaultDays,
                  }),
              ]
            : []),
        ...getActiveFilterRules(otherFilters).map((rule) =>
            toPylonFilter(kind, apiName(rule.target.fieldId), rule, today),
        ),
    ];
    const { localSorts, ...sort } = toSort(kind, metricQuery.sorts, apiName);
    const request: PylonRequest = {
        kind,
        filters,
        columns: metricQuery.dimensions.map(apiName),
        ...sort,
    };
    return { query: JSON.stringify(request), localSorts };
};
