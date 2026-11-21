import {
    DimensionType,
    FilterOperator,
    getItemMap,
    isAndFilterGroup,
    isDimension,
    isFilterGroup,
    ParameterError,
    UnitOfTime,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import {
    getApiName,
    getLiveDefinitionName,
    getLiveExplore,
    toFieldCombinationIssue,
    toLiveQueryError,
    type LiveCompiledRequest,
} from '../../explores/definition';
import { getLiveDateRange, toAbsoluteDateRange } from '../../query/dateRange';
import { toSalesforceObject } from './explores';
import {
    parseSalesforceExpression,
    type SalesforceColumnType,
    type SalesforceCondition,
    type SalesforceFilter,
    type SalesforceRequest,
    type SalesforceValueType,
} from './soql';

// Placeholder for the open side of a one-sided date filter; never sent
const EARLIEST_DATE = '1900-01-01';

const COLUMN_TYPE: Partial<Record<DimensionType, SalesforceColumnType>> = {
    [DimensionType.STRING]: 'string',
    [DimensionType.NUMBER]: 'number',
    [DimensionType.BOOLEAN]: 'boolean',
    [DimensionType.DATE]: 'date',
    [DimensionType.TIMESTAMP]: 'timestamp',
};

const addDays = (isoDate: string, days: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const addMonths = (isoDate: string, months: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
};

/** The last day of the current period, which may be in the future. */
const getCurrentPeriodEnd = (rule: FilterRule, start: string) => {
    const settings: { unitOfTime?: UnitOfTime } = rule.settings ?? {};
    switch (settings.unitOfTime ?? UnitOfTime.days) {
        case UnitOfTime.weeks:
            return addDays(start, 6);
        case UnitOfTime.months:
            return addDays(addMonths(start, 1), -1);
        case UnitOfTime.quarters:
            return addDays(addMonths(start, 3), -1);
        case UnitOfTime.years:
            return addDays(addMonths(start, 12), -1);
        default:
            return start;
    }
};

/**
 * A date filter as `field >= start AND field < day after end`. Dates in
 * Salesforce can be in the future (a close date), so "after" and "this
 * quarter" don't stop at today. Date and time fields compare in UTC.
 */
const toDateConditions = (
    rule: FilterRule,
    field: string,
    valueType: 'date' | 'datetime',
    today: string,
): SalesforceCondition[] => {
    const { startDate, endDate } = toAbsoluteDateRange(
        getLiveDateRange({
            rule,
            defaultDays: 30,
            today,
            earliestDate: EARLIEST_DATE,
        }),
        today,
    );
    const isOpenEnded =
        rule.operator === FilterOperator.GREATER_THAN ||
        rule.operator === FilterOperator.GREATER_THAN_OR_EQUAL;
    const end =
        rule.operator === FilterOperator.IN_THE_CURRENT
            ? getCurrentPeriodEnd(rule, startDate)
            : endDate;
    const toValue = (date: string) =>
        valueType === 'datetime' ? `${date}T00:00:00Z` : date;
    return [
        ...(startDate === EARLIEST_DATE
            ? []
            : [
                  {
                      field,
                      operator: 'gte' as const,
                      values: [toValue(startDate)],
                      valueType,
                  },
              ]),
        ...(isOpenEnded
            ? []
            : [
                  {
                      field,
                      operator: 'lt' as const,
                      values: [toValue(addDays(end, 1))],
                      valueType,
                  },
              ]),
    ];
};

const all = (conditions: SalesforceFilter[]): SalesforceFilter =>
    conditions.length === 1 ? conditions[0] : { and: conditions };
const any = (conditions: SalesforceFilter[]): SalesforceFilter =>
    conditions.length === 1 ? conditions[0] : { or: conditions };

/** One filter rule as SOQL conditions. Expects a rule that passed the shared check. */
const toRuleFilter = ({
    rule,
    apiName,
    type,
    today,
}: {
    rule: FilterRule;
    apiName: string;
    /** The dimension's type, or `metric` for a HAVING filter. */
    type: DimensionType | 'metric';
    today: string;
}): SalesforceFilter => {
    const expression = parseSalesforceExpression(apiName);
    if (
        !expression ||
        (expression.kind === 'aggregate' && type !== 'metric') ||
        (expression.kind === 'date' && expression.fn !== 'DAY_ONLY')
    ) {
        throw new ParameterError(
            `"${rule.target.fieldId}" can't be filtered on Salesforce; filter by its date instead.`,
        );
    }
    // A day of a date and time filters the date and time itself
    const isDay = expression.kind === 'date';
    const field = isDay ? expression.field : apiName;
    const values = rule.values ?? [];

    if (rule.operator === FilterOperator.NULL) {
        return { field, operator: 'is_null', values: [], valueType: 'string' };
    }
    if (rule.operator === FilterOperator.NOT_NULL) {
        return { field, operator: 'not_null', values: [], valueType: 'string' };
    }
    if (type === DimensionType.DATE || type === DimensionType.TIMESTAMP) {
        const valueType =
            isDay || type === DimensionType.TIMESTAMP ? 'datetime' : 'date';
        return all(toDateConditions(rule, field, valueType, today));
    }
    if (type === DimensionType.BOOLEAN) {
        return {
            field,
            operator: 'eq',
            values: [String(values[0]) === 'true'],
            valueType: 'boolean',
        };
    }
    const valueType: SalesforceValueType =
        type === DimensionType.NUMBER || type === 'metric'
            ? 'number'
            : 'string';
    const texts = values.map((value) =>
        valueType === 'number' ? String(Number(value)) : String(value),
    );
    if (valueType === 'number' && values.some((value) => value === '')) {
        throw new ParameterError(`"${rule.target.fieldId}" needs a number.`);
    }
    const condition = (
        operator: SalesforceCondition['operator'],
        conditionValues: string[],
    ): SalesforceCondition => ({
        field,
        operator,
        values: conditionValues,
        valueType,
    });
    switch (rule.operator) {
        case FilterOperator.EQUALS:
            return texts.length === 1
                ? condition('eq', texts)
                : condition('in', texts);
        case FilterOperator.NOT_EQUALS:
            return texts.length === 1
                ? condition('neq', texts)
                : condition('not_in', texts);
        case FilterOperator.GREATER_THAN:
            return condition('gt', texts.slice(0, 1));
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return condition('gte', texts.slice(0, 1));
        case FilterOperator.LESS_THAN:
            return condition('lt', texts.slice(0, 1));
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return condition('lte', texts.slice(0, 1));
        case FilterOperator.IN_BETWEEN:
            if (texts.length !== 2) {
                throw new ParameterError(
                    `"between" on "${rule.target.fieldId}" needs two numbers.`,
                );
            }
            return all([
                condition('gte', [texts[0]]),
                condition('lte', [texts[1]]),
            ]);
        case FilterOperator.INCLUDE:
            return any(texts.map((text) => condition('contains', [text])));
        case FilterOperator.NOT_INCLUDE:
            return all(texts.map((text) => condition('not_contains', [text])));
        case FilterOperator.STARTS_WITH:
            return any(texts.map((text) => condition('starts_with', [text])));
        case FilterOperator.ENDS_WITH:
            return any(texts.map((text) => condition('ends_with', [text])));
        default:
            throw new ParameterError(
                `"${rule.target.fieldId}" can't be filtered with "${rule.operator}" on Salesforce.`,
            );
    }
};

const isActive = (rule: FilterRule) =>
    !rule.disabled &&
    (rule.operator === FilterOperator.NULL ||
        rule.operator === FilterOperator.NOT_NULL ||
        (rule.values ?? []).length > 0);

const hasActiveRule = (group: FilterGroup | undefined): boolean =>
    !!group &&
    (isAndFilterGroup(group) ? group.and : group.or).some((item) =>
        isFilterGroup(item) ? hasActiveRule(item) : isActive(item),
    );

/** A filter group as a SOQL condition tree; null when nothing applies. */
const toGroupFilter = (
    group: FilterGroup | undefined,
    toRule: (rule: FilterRule) => SalesforceFilter,
): SalesforceFilter | null => {
    if (!group) return null;
    const items: FilterGroupItem[] = isAndFilterGroup(group)
        ? group.and
        : group.or;
    const filters = items.flatMap((item): SalesforceFilter[] => {
        if (isFilterGroup(item)) {
            const nested = toGroupFilter(item, toRule);
            return nested ? [nested] : [];
        }
        return isActive(item) ? [toRule(item)] : [];
    });
    if (filters.length === 0) return null;
    return isAndFilterGroup(group) ? all(filters) : any(filters);
};

/**
 * Compiles a metric query on a Salesforce explore into one SOQL request:
 * with metrics, an aggregate query Salesforce groups, totals, filters
 * (HAVING), sorts and limits itself; without, a list of records. `today`
 * is in UTC.
 */
export const compileSalesforceQuery = ({
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
    const dimensionOf = (fieldId: string) => {
        const item = itemsMap[fieldId];
        return item && isDimension(item) ? item : undefined;
    };
    const typeOf = (fieldId: string): DimensionType =>
        dimensionOf(fieldId)?.type ?? DimensionType.STRING;
    const isAggregate = metricQuery.metrics.length > 0;

    if (isAggregate) {
        const timestamps = metricQuery.dimensions.filter(
            (fieldId) => typeOf(fieldId) === DimensionType.TIMESTAMP,
        );
        if (timestamps.length > 0) {
            throw toLiveQueryError(
                timestamps.map((fieldId) =>
                    toFieldCombinationIssue(
                        fieldId,
                        `Salesforce can't total by ${
                            dimensionOf(fieldId)?.label ?? fieldId
                        }, a date and time. Use its day, month, quarter or year.`,
                    ),
                ),
            );
        }
        if (
            metricQuery.dimensions.length === 0 &&
            hasActiveRule(metricQuery.filters.metrics)
        ) {
            throw toLiveQueryError([
                toFieldCombinationIssue(
                    null,
                    'Salesforce filters metrics only when they are split by a dimension. Add a dimension, or filter the records instead.',
                ),
            ]);
        }
    }

    const where = toGroupFilter(metricQuery.filters.dimensions, (rule) =>
        toRuleFilter({
            rule,
            apiName: apiName(rule.target.fieldId),
            type: typeOf(rule.target.fieldId),
            today,
        }),
    );
    const having = isAggregate
        ? toGroupFilter(metricQuery.filters.metrics, (rule) =>
              toRuleFilter({
                  rule,
                  apiName: apiName(rule.target.fieldId),
                  type: 'metric',
                  today,
              }),
          )
        : null;

    const request: SalesforceRequest = {
        object: toSalesforceObject(getLiveDefinitionName(explore)),
        kind: isAggregate ? 'aggregate' : 'records',
        columns: [
            ...metricQuery.dimensions.map((fieldId) => ({
                name: apiName(fieldId),
                type: COLUMN_TYPE[typeOf(fieldId)] ?? ('string' as const),
            })),
            ...metricQuery.metrics.map((fieldId) => ({
                name: apiName(fieldId),
                type: 'number' as const,
            })),
        ],
        where,
        having,
        sorts: metricQuery.sorts.map(({ fieldId, descending }) => ({
            name: apiName(fieldId),
            descending,
        })),
    };
    return { query: JSON.stringify(request), localSorts: [] };
};
