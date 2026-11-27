import {
    DimensionType,
    FilterOperator,
    flattenFilterGroup,
    getItemMap,
    isDimension,
    ParameterError,
    type Explore,
    type FilterGroup,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiName,
    getLiveExplore,
    getLiveExploreApiName,
    type LiveCompiledRequest,
} from '../../sdk';
import { type SupabaseFilter, type SupabaseRequest } from './run';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A filter value as the column's type takes it; dates and times in UTC. */
const toValue = (value: unknown, type: DimensionType): string => {
    const text = value instanceof Date ? value.toISOString() : String(value);
    if (type === DimensionType.DATE) {
        if (ISO_DATE.test(text.slice(0, 10))) return text.slice(0, 10);
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) {
            throw new ParameterError(`"${text}" isn't a date.`);
        }
        return date.toISOString().slice(0, 10);
    }
    if (type === DimensionType.TIMESTAMP) {
        const date = new Date(ISO_DATE.test(text) ? `${text}T00:00:00Z` : text);
        if (Number.isNaN(date.getTime())) {
            throw new ParameterError(`"${text}" isn't a date and time.`);
        }
        return date.toISOString();
    }
    return text;
};

/** "Contains" and friends as an ilike pattern, * being its wildcard. */
const toPattern = (operator: FilterOperator, value: string) => {
    switch (operator) {
        case FilterOperator.STARTS_WITH:
            return `${value}*`;
        case FilterOperator.ENDS_WITH:
            return `*${value}`;
        default:
            return `*${value}*`;
    }
};

const RANGE_OPERATORS: Partial<
    Record<FilterOperator, SupabaseFilter['operator']>
> = {
    [FilterOperator.GREATER_THAN]: 'gt',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'gte',
    [FilterOperator.LESS_THAN]: 'lt',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'lte',
};

/** One rule as Data API filters. Expects a query that passed the shared check. */
const toFilters = (
    column: string,
    type: DimensionType,
    rule: FilterRule,
): SupabaseFilter[] => {
    const values = (rule.values ?? []).map((value) => toValue(value, type));
    const one = (operator: SupabaseFilter['operator']): SupabaseFilter[] =>
        values.length === 1
            ? [{ column, operator, value: values[0] }]
            : [
                  {
                      column,
                      operator: operator === 'eq' ? 'in' : 'not_in',
                      value: values,
                  },
              ];
    switch (rule.operator) {
        case FilterOperator.NULL:
            return [{ column, operator: 'is_null' }];
        case FilterOperator.NOT_NULL:
            return [{ column, operator: 'not_null' }];
        case FilterOperator.EQUALS:
            return one('eq');
        case FilterOperator.NOT_EQUALS:
            return one('neq');
        case FilterOperator.INCLUDE:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.NOT_INCLUDE: {
            const patterns = values.map((value) =>
                toPattern(rule.operator, value),
            );
            return [
                {
                    column,
                    operator:
                        rule.operator === FilterOperator.NOT_INCLUDE
                            ? 'not_ilike'
                            : 'ilike',
                    value: patterns.length === 1 ? patterns[0] : patterns,
                },
            ];
        }
        case FilterOperator.IN_BETWEEN: {
            const [start, end] = values;
            return [
                { column, operator: 'gte', value: start },
                { column, operator: 'lte', value: end },
            ];
        }
        default: {
            const operator = RANGE_OPERATORS[rule.operator];
            if (!operator) {
                throw new ParameterError(
                    `Supabase can't filter with "${rule.operator}".`,
                );
            }
            return [{ column, operator, value: values[0] }];
        }
    }
};

const NO_VALUE_OPERATORS = [FilterOperator.NULL, FilterOperator.NOT_NULL];

/** Rules that filter: enabled, with values unless they check for empty. */
const getFilteringRules = (group: FilterGroup | undefined): FilterRule[] =>
    (group ? flattenFilterGroup(group) : []).filter(
        (rule) =>
            !rule.disabled &&
            (NO_VALUE_OPERATORS.includes(rule.operator) ||
                (rule.values ?? []).length > 0),
    );

/**
 * Compiles a metric query on a Supabase explore into one read of the table
 * it stands for:
 * the selected columns, every filter ANDed, and the sorts, all applied by
 * the Data API.
 */
export const compileSupabaseQuery = ({
    explore,
    metricQuery,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
}): LiveCompiledRequest => {
    const apiSource = getLiveExplore(explore);
    const itemMap = getItemMap(explore);
    const apiName = (fieldId: string) => getApiName(apiSource, fieldId);
    const typeOf = (fieldId: string) => {
        const item = itemMap[fieldId];
        return item && isDimension(item) ? item.type : DimensionType.STRING;
    };
    const filters = getFilteringRules(metricQuery.filters.dimensions).flatMap(
        (rule) =>
            toFilters(
                apiName(rule.target.fieldId),
                typeOf(rule.target.fieldId),
                rule,
            ),
    );
    if (metricQuery.dimensions.length === 0) {
        throw new ParameterError('Pick at least one column of the table.');
    }
    const table = getLiveExploreApiName(explore);
    if (table === null) {
        throw new ParameterError('This explore reads no Supabase table.');
    }
    const request: SupabaseRequest = {
        table,
        select: metricQuery.dimensions.map(apiName),
        ...(filters.length > 0 ? { filters } : {}),
        ...(metricQuery.sorts.length > 0
            ? {
                  order: metricQuery.sorts.map(({ fieldId, descending }) => ({
                      column: apiName(fieldId),
                      ascending: !descending,
                  })),
              }
            : {}),
    };
    return { query: JSON.stringify(request), localSorts: [] };
};
