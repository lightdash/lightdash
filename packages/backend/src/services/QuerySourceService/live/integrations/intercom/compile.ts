import {
    FilterOperator,
    flattenFilterGroup,
    ParameterError,
    type Explore,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
    type SortField,
} from '@lightdash/common';
import {
    getApiName,
    getLiveDateRange,
    getLiveDefinitionName,
    getLiveExplore,
    splitDateRangeFilter,
    toAbsoluteDateRange,
    type LiveCompiledRequest,
} from '../../sdk';
import {
    INTERCOM_LOOKUP_FIELDS,
    INTERCOM_MAX_GROUP_SIZE,
    type IntercomFilter,
    type IntercomFilterLeaf,
    type IntercomKind,
    type IntercomRequest,
} from './run';

/** Before Intercom's API existed, for open-ended date filters. */
const INTERCOM_EARLIEST_DATE = '2011-01-01';

/** How a field is searched, where it differs from a plain text field. */
type SearchField = {
    field: string;
    /** Integer IDs and counts are sent as numbers; minutes become seconds. */
    value?: 'integer' | 'minutes' | 'number' | 'boolean';
    date?: true;
};

const ASSIGNEE_FIELDS: Record<string, SearchField> = {
    team_assignee_id: { field: 'team_assignee_id', value: 'integer' },
    admin_assignee_id: { field: 'admin_assignee_id', value: 'integer' },
    team_assignee_name: { field: 'team_assignee_name' },
    admin_assignee_name: { field: 'admin_assignee_name' },
};

/** Each filterable field's name in Intercom's search query. */
const SEARCH_FIELDS: Record<IntercomKind, Record<string, SearchField>> = {
    conversations: {
        id: { field: 'id' },
        state: { field: 'state' },
        priority: { field: 'priority' },
        source_type: { field: 'source.type' },
        ...ASSIGNEE_FIELDS,
        tag_ids: { field: 'tag_ids' },
        created_at: { field: 'created_at', date: true },
        updated_at: { field: 'updated_at', date: true },
        last_closed_at: { field: 'statistics.last_close_at', date: true },
        first_admin_reply_at: {
            field: 'statistics.first_admin_reply_at',
            date: true,
        },
        time_to_assignment_minutes: {
            field: 'statistics.time_to_assignment',
            value: 'minutes',
        },
        time_to_admin_reply_minutes: {
            field: 'statistics.time_to_admin_reply',
            value: 'minutes',
        },
        time_to_first_close_minutes: {
            field: 'statistics.time_to_first_close',
            value: 'minutes',
        },
        time_to_last_close_minutes: {
            field: 'statistics.time_to_last_close',
            value: 'minutes',
        },
        median_time_to_reply_minutes: {
            field: 'statistics.median_time_to_reply',
            value: 'minutes',
        },
        count_reopens: { field: 'statistics.count_reopens', value: 'number' },
        count_assignments: {
            field: 'statistics.count_assignments',
            value: 'number',
        },
        count_conversation_parts: {
            field: 'statistics.count_conversation_parts',
            value: 'number',
        },
        last_closed_by_id: {
            field: 'statistics.last_closed_by_id',
            value: 'integer',
        },
        last_closed_by_name: { field: 'last_closed_by_name' },
        rating: { field: 'conversation_rating.score', value: 'number' },
        rating_teammate_id: {
            field: 'conversation_rating.admin_id',
            value: 'integer',
        },
        rating_teammate_name: { field: 'rating_teammate_name' },
        ai_agent_participated: {
            field: 'ai_agent_participated',
            value: 'boolean',
        },
        ai_agent_resolution_state: { field: 'ai_agent.resolution_state' },
        ai_agent_last_answer_type: { field: 'ai_agent.last_answer_type' },
        ai_agent_source_type: { field: 'ai_agent.source_type' },
        ai_agent_rating: { field: 'ai_agent.rating', value: 'number' },
    },
    tickets: {
        id: { field: 'id' },
        title: { field: 'title' },
        category: { field: 'category' },
        ticket_type_id: { field: 'ticket_type_id', value: 'integer' },
        open: { field: 'open', value: 'boolean' },
        ...ASSIGNEE_FIELDS,
        created_at: { field: 'created_at', date: true },
        updated_at: { field: 'updated_at', date: true },
    },
    contacts: {
        id: { field: 'id' },
        role: { field: 'role' },
        name: { field: 'name' },
        email: { field: 'email' },
        email_domain: { field: 'email_domain' },
        country: { field: 'location.country' },
        created_at: { field: 'created_at', date: true },
        signed_up_at: { field: 'signed_up_at', date: true },
        last_seen_at: { field: 'last_seen_at', date: true },
    },
    teammates: {},
    teams: {},
};

const SORT_FIELDS: Record<IntercomKind, Record<string, string>> = {
    conversations: {
        created_at: 'created_at',
        created_time: 'created_at',
        updated_at: 'updated_at',
        waiting_since: 'waiting_since',
    },
    tickets: {
        created_at: 'created_at',
        created_time: 'created_at',
        updated_at: 'updated_at',
    },
    contacts: {
        created_at: 'created_at',
        signed_up_at: 'signed_up_at',
        last_seen_at: 'last_seen_at',
    },
    teammates: {},
    teams: {},
};

const toUnixSeconds = (isoDate: string) =>
    Date.parse(`${isoDate}T00:00:00Z`) / 1000;

const addDay = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
};

/** Whole UTC days, as a [start, end) pair of Unix-time filters. */
const toTimeRange = (
    field: string,
    rule: FilterRule | null,
    { today, defaultDays }: { today: string; defaultDays: number },
): IntercomFilterLeaf[] => {
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays,
            today,
            earliestDate: INTERCOM_EARLIEST_DATE,
        }),
        today,
    );
    return [
        { field, operator: '>=', value: toUnixSeconds(startDate) },
        { field, operator: '<', value: toUnixSeconds(addDay(endDate)) },
    ];
};

const toNumber = (value: unknown, label: string) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new ParameterError(`${label} must be a number.`);
    }
    return number;
};

const toValue = (search: SearchField, value: unknown, label: string) => {
    switch (search.value) {
        case 'integer':
            return Math.trunc(toNumber(value, label));
        case 'minutes':
            return Math.round(toNumber(value, label) * 60);
        case 'number':
            return toNumber(value, label);
        case 'boolean':
            return value === true || value === 'true';
        default:
            return String(value).trim();
    }
};

const chunk = <T>(values: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
        values.slice(index * size, (index + 1) * size),
    );

/** Leaves under one operator: any of them, or all of them. */
const group = (
    leaves: IntercomFilterLeaf[],
    operator: 'AND' | 'OR',
): IntercomFilter[] => {
    if (leaves.length <= 1) return leaves;
    return [{ operator, value: leaves }];
};

const COMPARISONS: Partial<
    Record<FilterOperator, IntercomFilterLeaf['operator']>
> = {
    [FilterOperator.GREATER_THAN]: '>',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '>=',
    [FilterOperator.LESS_THAN]: '<',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '<=',
};

/** The filters one rule needs. Expects a query that passed the shared check. */
const toFilters = (
    kind: IntercomKind,
    apiName: string,
    rule: FilterRule,
    today: string,
): IntercomFilter[] => {
    const search = SEARCH_FIELDS[kind][apiName];
    if (!search) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't be filtered on Intercom.`,
        );
    }
    if (search.date) {
        return toTimeRange(search.field, rule, { today, defaultDays: 30 });
    }
    const label = rule.target.fieldId;
    const values = (rule.values ?? []).map((value) =>
        toValue(search, value, label),
    );
    const { field } = search;
    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS: {
            const isNegative = rule.operator === FilterOperator.NOT_EQUALS;
            // Names take a list, turned into IDs before the search
            if (Object.hasOwn(INTERCOM_LOOKUP_FIELDS, field)) {
                return [
                    {
                        field,
                        operator: isNegative ? 'NIN' : 'IN',
                        value: values as string[],
                    },
                ];
            }
            if (search.value === 'boolean' || values.length === 1) {
                return [
                    {
                        field,
                        operator: isNegative ? '!=' : '=',
                        value: values[0],
                    },
                ];
            }
            // Intercom takes 15 values a list: any list matches, or none does
            const lists = chunk(
                values as (string | number)[],
                INTERCOM_MAX_GROUP_SIZE,
            ).map(
                (list): IntercomFilterLeaf => ({
                    field,
                    operator: isNegative ? 'NIN' : 'IN',
                    value: list,
                }),
            );
            return isNegative ? lists : group(lists, 'OR');
        }
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE: {
            const isNegative = rule.operator === FilterOperator.NOT_INCLUDE;
            return group(
                values.map((value) => ({
                    field,
                    operator: isNegative ? '!~' : '~',
                    value,
                })),
                isNegative ? 'AND' : 'OR',
            );
        }
        default: {
            const operator = COMPARISONS[rule.operator];
            if (!operator) {
                throw new ParameterError(
                    `"${rule.target.fieldId}" can't use "${rule.operator}" on Intercom.`,
                );
            }
            return [{ field, operator, value: values[0] }];
        }
    }
};

const NO_VALUE_OPERATORS = [FilterOperator.NULL, FilterOperator.NOT_NULL];

/** Rules that filter: enabled, with values unless they check for empty. */
const getFilteringRules = (group_: FilterGroup | undefined): FilterRule[] =>
    (group_ ? flattenFilterGroup(group_) : []).filter(
        (rule) =>
            !rule.disabled &&
            (NO_VALUE_OPERATORS.includes(rule.operator) ||
                (rule.values ?? []).length > 0),
    );

/** Intercom sorts by one field it knows; any other order is ours. */
const toSort = (
    kind: IntercomKind,
    sorts: SortField[],
    apiName: (fieldId: string) => string,
): Pick<IntercomRequest, 'sort'> & { localSorts: SortField[] } => {
    const [first, ...others] = sorts;
    if (!first) {
        return kind === 'conversations' || kind === 'tickets'
            ? {
                  sort: { field: 'created_at', order: 'descending' },
                  localSorts: [],
              }
            : { localSorts: [] };
    }
    const field =
        others.length === 0
            ? SORT_FIELDS[kind][apiName(first.fieldId)]
            : undefined;
    return field
        ? {
              sort: {
                  field,
                  order: first.descending ? 'descending' : 'ascending',
              },
              localSorts: [],
          }
        : { localSorts: sorts };
};

const KINDS: readonly IntercomKind[] = [
    'conversations',
    'tickets',
    'contacts',
    'teammates',
    'teams',
];

const toKind = (explore: Explore): IntercomKind => {
    const name = getLiveDefinitionName(explore);
    const kind = KINDS.find((candidate) => candidate === name);
    if (!kind) {
        throw new ParameterError(
            `"${explore.name}" isn't an Intercom explore.`,
        );
    }
    return kind;
};

/**
 * Compiles a metric query on an Intercom explore into one search, or one
 * list. Conversations and tickets always search a range of creation days,
 * the last 30 without a Created filter. `today` is in UTC.
 */
export const compileIntercomQuery = ({
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
    const filters: IntercomFilter[] = [
        ...(dateRange
            ? toTimeRange(
                  SEARCH_FIELDS[kind][apiName(dateRange.fieldId)]?.field ??
                      apiName(dateRange.fieldId),
                  dateRule,
                  { today, defaultDays: dateRange.defaultDays },
              )
            : []),
        ...getFilteringRules(otherFilters).flatMap((rule) =>
            toFilters(kind, apiName(rule.target.fieldId), rule, today),
        ),
    ];
    const { localSorts, ...sort } = toSort(kind, metricQuery.sorts, apiName);
    const request: IntercomRequest = {
        kind,
        filters,
        columns: metricQuery.dimensions.map(apiName),
        ...sort,
    };
    return { query: JSON.stringify(request), localSorts };
};
