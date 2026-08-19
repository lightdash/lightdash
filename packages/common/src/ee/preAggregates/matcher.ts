import { parseAllReferences } from '../../compiler/exploreCompiler';
import type { Explore } from '../../types/explore';
import {
    convertFieldRefToFieldId,
    isCustomBinDimension,
    isCustomSqlDimension,
    isSqlTableCalculation,
    MetricType,
    type FieldId,
} from '../../types/field';
import {
    FilterOperator,
    flattenFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    UnitOfTime,
    type DateFilterSettings,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type MetricFilterRule,
} from '../../types/filter';
import type { MetricQuery } from '../../types/metricQuery';
import {
    PreAggregateMissReason,
    type PreAggregateDef,
    type PreAggregateMatchMiss,
} from '../../types/preAggregate';
import { TimeFrames } from '../../types/timeFrames';
import assertUnreachable from '../../utils/assertUnreachable';
import { getMetricsMapFromTables } from '../../utils/fields';
import {
    createFilterRuleFromModelRequiredFilterRule,
    reduceRequiredDimensionFiltersToFilterRules,
} from '../../utils/filters';
import { getItemId } from '../../utils/item';
import {
    getMetricRepresentation,
    PreAggregateMetricRepresentationKind,
} from './metricRepresentation';
import {
    getDimensionBaseName,
    getDimensionReferences,
    getMetricReferences,
} from './references';
import {
    getEffectiveDimensionTimeFrame,
    getPreAggregateGranularityRank,
    getTimeFrameDerivability,
    TimeFrameDerivability,
} from './timeFrameDerivability';

export type PreAggregateMatchResult =
    | { hit: true; preAggregateName: string; miss: null }
    | { hit: false; preAggregateName: null; miss: PreAggregateMatchMiss };

const getDimensionsByFieldId = (
    explore: Explore,
): Map<FieldId, Explore['tables'][string]['dimensions'][string]> => {
    const dimensionsByFieldId = new Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >();

    Object.values(explore.tables).forEach((table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            dimensionsByFieldId.set(getItemId(dimension), dimension);
        });
    });

    return dimensionsByFieldId;
};

const dimensionFieldIdMatchesDef = (
    fieldId: FieldId,
    explore: Explore,
    defDimensions: Set<string>,
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >,
): boolean => {
    const dimension = dimensionsByFieldId.get(fieldId);
    if (!dimension) {
        return false;
    }

    return getDimensionReferences({
        dimension,
        baseTable: explore.baseTable,
    }).some((reference) => defDimensions.has(reference));
};

const filterDimensionFieldIdMatchesDef = (
    fieldId: FieldId,
    explore: Explore,
    preAggregateDef: PreAggregateDef,
    defDimensions: Set<string>,
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >,
): boolean => {
    if (
        !dimensionFieldIdMatchesDef(
            fieldId,
            explore,
            defDimensions,
            dimensionsByFieldId,
        )
    ) {
        return false;
    }

    if (!preAggregateDef.timeDimension || !preAggregateDef.granularity) {
        return true;
    }

    const dimension = dimensionsByFieldId.get(fieldId);
    if (!dimension) {
        return false;
    }

    const targetsPreAggregateTimeDimension = getDimensionReferences({
        dimension,
        baseTable: explore.baseTable,
    }).includes(preAggregateDef.timeDimension);

    return (
        !targetsPreAggregateTimeDimension ||
        getTimeFrameDerivability(
            getEffectiveDimensionTimeFrame(dimension),
            preAggregateDef.granularity,
        ) === TimeFrameDerivability.DERIVABLE
    );
};

const extractDimensionFilterFieldIds = (
    metricQuery: MetricQuery,
): FieldId[] => {
    if (!metricQuery.filters.dimensions) {
        return [];
    }

    return flattenFilterGroup(metricQuery.filters.dimensions)
        .filter((rule) => !rule.disabled)
        .map((rule) => rule.target)
        .filter(
            (target): target is { fieldId: FieldId } =>
                !!target &&
                typeof target === 'object' &&
                'fieldId' in target &&
                typeof target.fieldId === 'string',
        )
        .map((target) => target.fieldId);
};

// Field ids referenced by the base model's sql_filter. ${TABLE}.col raw
// references and ${lightdash.*} attributes are not field references.
const extractSqlFilterFieldIds = (explore: Explore): FieldId[] => {
    const uncompiledSqlWhere =
        explore.tables[explore.baseTable]?.uncompiledSqlWhere;
    if (!uncompiledSqlWhere) {
        return [];
    }

    return parseAllReferences(uncompiledSqlWhere, explore.baseTable)
        .filter((ref) => ref.refName !== 'TABLE')
        .map((ref) => getItemId({ table: ref.refTable, name: ref.refName }));
};

const getPreAggregateFilterTargetReferences = (
    filter: MetricFilterRule,
    baseTable: string,
): Set<string> =>
    new Set(
        filter.target.fieldRef.includes('.')
            ? [filter.target.fieldRef]
            : [
                  filter.target.fieldRef,
                  `${baseTable}.${filter.target.fieldRef}`,
              ],
    );

const dimensionMatchesPreAggregateFilterTarget = ({
    dimension,
    preAggregateFilter,
    explore,
}: {
    dimension: Explore['tables'][string]['dimensions'][string];
    preAggregateFilter: MetricFilterRule;
    explore: Explore;
}): boolean => {
    const preAggregateReferences = getPreAggregateFilterTargetReferences(
        preAggregateFilter,
        explore.baseTable,
    );

    return getDimensionReferences({
        dimension,
        baseTable: explore.baseTable,
    }).some((reference) => preAggregateReferences.has(reference));
};

const matchesPreAggregateFilterTarget = ({
    queryFilterRule,
    preAggregateFilter,
    explore,
    dimensionsByFieldId,
}: {
    queryFilterRule: FilterRule;
    preAggregateFilter: MetricFilterRule;
    explore: Explore;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
}): boolean => {
    const queryFieldId = queryFilterRule.target.fieldId;
    const queryDimension = dimensionsByFieldId.get(queryFieldId);
    if (!queryDimension) {
        return false;
    }

    return dimensionMatchesPreAggregateFilterTarget({
        dimension: queryDimension,
        preAggregateFilter,
        explore,
    });
};

const isValueSubset = (
    queryValues: unknown[] | undefined,
    preAggregateValues: unknown[] | undefined,
): boolean => {
    if (!queryValues || queryValues.length === 0) {
        return false;
    }
    if (!preAggregateValues || preAggregateValues.length === 0) {
        return false;
    }

    return queryValues.every((queryValue) =>
        preAggregateValues.some((preAggregateValue) =>
            Object.is(queryValue, preAggregateValue),
        ),
    );
};

const hasFilterValues = (values: unknown[] | undefined): values is unknown[] =>
    Array.isArray(values) && values.length > 0;

type Range = {
    lower?: { value: number; inclusive: boolean };
    upper?: { value: number; inclusive: boolean };
};

const getRangeForFilter = (
    filter: FilterRule<FilterOperator, unknown>,
    toComparableValue: (value: unknown) => number | null,
): Range | null => {
    switch (filter.operator) {
        case FilterOperator.GREATER_THAN: {
            const value = toComparableValue(filter.values?.[0]);
            return value === null
                ? null
                : { lower: { value, inclusive: false } };
        }
        case FilterOperator.GREATER_THAN_OR_EQUAL: {
            const value = toComparableValue(filter.values?.[0]);
            return value === null
                ? null
                : { lower: { value, inclusive: true } };
        }
        case FilterOperator.LESS_THAN: {
            const value = toComparableValue(filter.values?.[0]);
            return value === null
                ? null
                : { upper: { value, inclusive: false } };
        }
        case FilterOperator.LESS_THAN_OR_EQUAL: {
            const value = toComparableValue(filter.values?.[0]);
            return value === null
                ? null
                : { upper: { value, inclusive: true } };
        }
        case FilterOperator.IN_BETWEEN: {
            const lower = toComparableValue(filter.values?.[0]);
            const upper = toComparableValue(filter.values?.[1]);
            return lower === null || upper === null
                ? null
                : {
                      lower: { value: lower, inclusive: true },
                      upper: { value: upper, inclusive: true },
                  };
        }
        default:
            return null;
    }
};

const isLowerBoundNarrowerOrEqual = (
    query: Range['lower'],
    preAggregate: Range['lower'],
): boolean => {
    if (!preAggregate) {
        return true;
    }
    if (!query) {
        return false;
    }

    if (query.value > preAggregate.value) {
        return true;
    }
    if (query.value < preAggregate.value) {
        return false;
    }

    return preAggregate.inclusive || !query.inclusive;
};

const isUpperBoundNarrowerOrEqual = (
    query: Range['upper'],
    preAggregate: Range['upper'],
): boolean => {
    if (!preAggregate) {
        return true;
    }
    if (!query) {
        return false;
    }

    if (query.value < preAggregate.value) {
        return true;
    }
    if (query.value > preAggregate.value) {
        return false;
    }

    return preAggregate.inclusive || !query.inclusive;
};

const isRangeSubset = (
    queryRange: Range | null,
    preAggregateRange: Range | null,
): boolean =>
    !!queryRange &&
    !!preAggregateRange &&
    isLowerBoundNarrowerOrEqual(queryRange.lower, preAggregateRange.lower) &&
    isUpperBoundNarrowerOrEqual(queryRange.upper, preAggregateRange.upper);

const containsComparableValue = (range: Range, value: number): boolean => {
    let satisfiesLower = true;
    if (range.lower) {
        satisfiesLower = range.lower.inclusive
            ? value >= range.lower.value
            : value > range.lower.value;
    }

    let satisfiesUpper = true;
    if (range.upper) {
        satisfiesUpper = range.upper.inclusive
            ? value <= range.upper.value
            : value < range.upper.value;
    }

    return satisfiesLower && satisfiesUpper;
};

const getUnitOrder = (unit: UnitOfTime): number =>
    [
        UnitOfTime.milliseconds,
        UnitOfTime.seconds,
        UnitOfTime.minutes,
        UnitOfTime.hours,
        UnitOfTime.days,
        UnitOfTime.weeks,
        UnitOfTime.months,
        UnitOfTime.quarters,
        UnitOfTime.years,
    ].indexOf(unit);

const getDateFilterSettings = (
    filterRule: FilterRule | MetricFilterRule,
): DateFilterSettings | undefined =>
    filterRule.settings as DateFilterSettings | undefined;

const getDateFilterUnitOfTime = (
    filterRule: FilterRule | MetricFilterRule,
): UnitOfTime =>
    getDateFilterSettings(filterRule)?.unitOfTime || UnitOfTime.days;

const isCompletedDateFilter = (
    filterRule: FilterRule | MetricFilterRule,
): boolean => !!getDateFilterSettings(filterRule)?.completed;

const isRelativeDateFilterEquivalentOrNarrower = (
    queryFilterRule: FilterRule,
    preAggregateFilter: MetricFilterRule,
): boolean => {
    if (queryFilterRule.operator !== preAggregateFilter.operator) {
        return false;
    }

    switch (preAggregateFilter.operator) {
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT: {
            const preAggregateUnit =
                getDateFilterUnitOfTime(preAggregateFilter);
            const queryUnit = getDateFilterUnitOfTime(queryFilterRule);
            const preAggregateCompleted =
                isCompletedDateFilter(preAggregateFilter);
            const queryCompleted = isCompletedDateFilter(queryFilterRule);
            const preAggregateValue = Number(preAggregateFilter.values?.[0]);
            const queryValue = Number(queryFilterRule.values?.[0]);

            return (
                preAggregateUnit === queryUnit &&
                preAggregateCompleted === queryCompleted &&
                Number.isFinite(preAggregateValue) &&
                Number.isFinite(queryValue) &&
                queryValue <= preAggregateValue
            );
        }
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT: {
            const preAggregateUnit =
                getDateFilterUnitOfTime(preAggregateFilter);
            const queryUnit = getDateFilterUnitOfTime(queryFilterRule);
            const preAggregateUnitOrder = getUnitOrder(preAggregateUnit);
            const queryUnitOrder = getUnitOrder(queryUnit);

            if (preAggregateUnitOrder === -1 || queryUnitOrder === -1) {
                return false;
            }

            return preAggregateFilter.operator === FilterOperator.IN_THE_CURRENT
                ? queryUnitOrder <= preAggregateUnitOrder
                : queryUnitOrder >= preAggregateUnitOrder;
        }
        case FilterOperator.NOT_IN_THE_PAST:
            return (
                getDateFilterUnitOfTime(queryFilterRule) ===
                    getDateFilterUnitOfTime(preAggregateFilter) &&
                isCompletedDateFilter(queryFilterRule) ===
                    isCompletedDateFilter(preAggregateFilter) &&
                isValueSubset(queryFilterRule.values, preAggregateFilter.values)
            );
        default:
            return false;
    }
};

const isStringFilterEquivalentOrNarrower = (
    queryFilterRule: FilterRule,
    preAggregateFilter: MetricFilterRule,
): boolean => {
    const preAggregateValue = String(preAggregateFilter.values?.[0] ?? '');

    switch (preAggregateFilter.operator) {
        case FilterOperator.EQUALS:
            return (
                queryFilterRule.operator === FilterOperator.EQUALS &&
                isValueSubset(queryFilterRule.values, preAggregateFilter.values)
            );
        case FilterOperator.INCLUDE:
            switch (queryFilterRule.operator) {
                case FilterOperator.EQUALS:
                    return (
                        hasFilterValues(queryFilterRule.values) &&
                        queryFilterRule.values.every((value) =>
                            String(value).includes(preAggregateValue),
                        )
                    );
                case FilterOperator.INCLUDE:
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                    return String(queryFilterRule.values?.[0] ?? '').includes(
                        preAggregateValue,
                    );
                default:
                    return false;
            }
        case FilterOperator.STARTS_WITH:
            switch (queryFilterRule.operator) {
                case FilterOperator.EQUALS:
                    return (
                        hasFilterValues(queryFilterRule.values) &&
                        queryFilterRule.values.every((value) =>
                            String(value).startsWith(preAggregateValue),
                        )
                    );
                case FilterOperator.STARTS_WITH:
                    return String(queryFilterRule.values?.[0] ?? '').startsWith(
                        preAggregateValue,
                    );
                default:
                    return false;
            }
        case FilterOperator.ENDS_WITH:
            switch (queryFilterRule.operator) {
                case FilterOperator.EQUALS:
                    return (
                        hasFilterValues(queryFilterRule.values) &&
                        queryFilterRule.values.every((value) =>
                            String(value).endsWith(preAggregateValue),
                        )
                    );
                case FilterOperator.ENDS_WITH:
                    return String(queryFilterRule.values?.[0] ?? '').endsWith(
                        preAggregateValue,
                    );
                default:
                    return false;
            }
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return queryFilterRule.operator === preAggregateFilter.operator;
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.NOT_INCLUDE:
            return (
                queryFilterRule.operator === preAggregateFilter.operator &&
                isValueSubset(queryFilterRule.values, preAggregateFilter.values)
            );
        default:
            return false;
    }
};

const isNumberFilterEquivalentOrNarrower = (
    queryFilterRule: FilterRule,
    preAggregateFilter: MetricFilterRule,
): boolean => {
    if (preAggregateFilter.operator === FilterOperator.EQUALS) {
        return (
            queryFilterRule.operator === FilterOperator.EQUALS &&
            isValueSubset(queryFilterRule.values, preAggregateFilter.values)
        );
    }

    if (
        preAggregateFilter.operator === FilterOperator.NULL ||
        preAggregateFilter.operator === FilterOperator.NOT_NULL
    ) {
        return queryFilterRule.operator === preAggregateFilter.operator;
    }

    if (
        preAggregateFilter.operator === FilterOperator.NOT_EQUALS ||
        preAggregateFilter.operator === FilterOperator.NOT_IN_BETWEEN
    ) {
        return (
            queryFilterRule.operator === preAggregateFilter.operator &&
            isValueSubset(queryFilterRule.values, preAggregateFilter.values)
        );
    }

    const toComparableValue = (value: unknown): number | null => {
        const comparableValue = Number(value);
        return Number.isFinite(comparableValue) ? comparableValue : null;
    };

    const preAggregateRange = getRangeForFilter(
        preAggregateFilter,
        toComparableValue,
    );
    if (!preAggregateRange) {
        return false;
    }

    if (queryFilterRule.operator === FilterOperator.EQUALS) {
        return (
            hasFilterValues(queryFilterRule.values) &&
            queryFilterRule.values.every((value) => {
                const comparableValue = toComparableValue(value);
                return (
                    comparableValue !== null &&
                    containsComparableValue(preAggregateRange, comparableValue)
                );
            })
        );
    }

    return isRangeSubset(
        getRangeForFilter(queryFilterRule, toComparableValue),
        preAggregateRange,
    );
};

const isDateFilterEquivalentOrNarrower = (
    queryFilterRule: FilterRule,
    preAggregateFilter: MetricFilterRule,
): boolean => {
    if (
        preAggregateFilter.operator === FilterOperator.IN_THE_PAST ||
        preAggregateFilter.operator === FilterOperator.NOT_IN_THE_PAST ||
        preAggregateFilter.operator === FilterOperator.IN_THE_NEXT ||
        preAggregateFilter.operator === FilterOperator.IN_THE_CURRENT ||
        preAggregateFilter.operator === FilterOperator.NOT_IN_THE_CURRENT
    ) {
        return isRelativeDateFilterEquivalentOrNarrower(
            queryFilterRule,
            preAggregateFilter,
        );
    }

    if (preAggregateFilter.operator === FilterOperator.EQUALS) {
        return (
            queryFilterRule.operator === FilterOperator.EQUALS &&
            isValueSubset(queryFilterRule.values, preAggregateFilter.values)
        );
    }

    if (
        preAggregateFilter.operator === FilterOperator.NULL ||
        preAggregateFilter.operator === FilterOperator.NOT_NULL
    ) {
        return queryFilterRule.operator === preAggregateFilter.operator;
    }

    if (
        preAggregateFilter.operator === FilterOperator.NOT_EQUALS ||
        preAggregateFilter.operator === FilterOperator.NOT_IN_BETWEEN
    ) {
        return (
            queryFilterRule.operator === preAggregateFilter.operator &&
            isValueSubset(queryFilterRule.values, preAggregateFilter.values)
        );
    }

    const toComparableValue = (value: unknown): number | null => {
        if (value === undefined || value === null) {
            return null;
        }
        const comparableValue = new Date(String(value)).getTime();
        return Number.isFinite(comparableValue) ? comparableValue : null;
    };

    const preAggregateRange = getRangeForFilter(
        preAggregateFilter,
        toComparableValue,
    );
    if (!preAggregateRange) {
        return false;
    }

    if (queryFilterRule.operator === FilterOperator.EQUALS) {
        return (
            hasFilterValues(queryFilterRule.values) &&
            queryFilterRule.values.every((value) => {
                const comparableValue = toComparableValue(value);
                return (
                    comparableValue !== null &&
                    containsComparableValue(preAggregateRange, comparableValue)
                );
            })
        );
    }

    return isRangeSubset(
        getRangeForFilter(queryFilterRule, toComparableValue),
        preAggregateRange,
    );
};

const isBooleanFilterEquivalentOrNarrower = (
    queryFilterRule: FilterRule,
    preAggregateFilter: MetricFilterRule,
): boolean => {
    if (
        preAggregateFilter.operator === FilterOperator.NULL ||
        preAggregateFilter.operator === FilterOperator.NOT_NULL
    ) {
        return queryFilterRule.operator === preAggregateFilter.operator;
    }

    return (
        queryFilterRule.operator === preAggregateFilter.operator &&
        isValueSubset(queryFilterRule.values, preAggregateFilter.values)
    );
};

const isFilterRuleEquivalentOrNarrower = ({
    queryFilterRule,
    preAggregateFilter,
    explore,
    dimensionsByFieldId,
}: {
    queryFilterRule: FilterRule;
    preAggregateFilter: MetricFilterRule;
    explore: Explore;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
}): boolean => {
    if (queryFilterRule.disabled) {
        return false;
    }
    if (
        !matchesPreAggregateFilterTarget({
            queryFilterRule,
            preAggregateFilter,
            explore,
            dimensionsByFieldId,
        })
    ) {
        return false;
    }

    const queryDimension = dimensionsByFieldId.get(
        queryFilterRule.target.fieldId,
    );
    if (!queryDimension) {
        return false;
    }

    switch (queryDimension.type) {
        case 'string':
            return isStringFilterEquivalentOrNarrower(
                queryFilterRule,
                preAggregateFilter,
            );
        case 'number':
            return isNumberFilterEquivalentOrNarrower(
                queryFilterRule,
                preAggregateFilter,
            );
        case 'date':
        case 'timestamp':
            return isDateFilterEquivalentOrNarrower(
                queryFilterRule,
                preAggregateFilter,
            );
        case 'boolean':
            return isBooleanFilterEquivalentOrNarrower(
                queryFilterRule,
                preAggregateFilter,
            );
        default:
            return false;
    }
};

const filterGroupImpliesPreAggregateFilter = ({
    filterGroup,
    preAggregateFilter,
    explore,
    dimensionsByFieldId,
}: {
    filterGroup: FilterGroup | undefined;
    preAggregateFilter: MetricFilterRule;
    explore: Explore;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
}): boolean => {
    if (!filterGroup) {
        return false;
    }

    const groupItems: FilterGroupItem[] = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;

    if (groupItems.length === 0) {
        return false;
    }

    if (isAndFilterGroup(filterGroup)) {
        return groupItems.some((item) =>
            isFilterGroup(item)
                ? filterGroupImpliesPreAggregateFilter({
                      filterGroup: item,
                      preAggregateFilter,
                      explore,
                      dimensionsByFieldId,
                  })
                : isFilterRuleEquivalentOrNarrower({
                      queryFilterRule: item,
                      preAggregateFilter,
                      explore,
                      dimensionsByFieldId,
                  }),
        );
    }

    return groupItems.every((item) =>
        isFilterGroup(item)
            ? filterGroupImpliesPreAggregateFilter({
                  filterGroup: item,
                  preAggregateFilter,
                  explore,
                  dimensionsByFieldId,
              })
            : isFilterRuleEquivalentOrNarrower({
                  queryFilterRule: item,
                  preAggregateFilter,
                  explore,
                  dimensionsByFieldId,
              }),
    );
};

const getUnsatisfiedPreAggregateFilterMiss = ({
    metricQuery,
    explore,
    preAggregateDef,
    dimensionsByFieldId,
}: {
    metricQuery: MetricQuery;
    explore: Explore;
    preAggregateDef: PreAggregateDef;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
}): Extract<
    PreAggregateMatchMiss,
    { reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED }
> | null => {
    const preAggregateFilters = preAggregateDef.filters || [];
    const unsatisfiedFilter = preAggregateFilters.find(
        (preAggregateFilter) =>
            !filterGroupImpliesPreAggregateFilter({
                filterGroup: metricQuery.filters.dimensions,
                preAggregateFilter,
                explore,
                dimensionsByFieldId,
            }),
    );

    if (!unsatisfiedFilter) {
        return null;
    }

    return {
        reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
        fieldId: convertFieldRefToFieldId(
            unsatisfiedFilter.target.fieldRef,
            explore.baseTable,
        ),
    };
};

// Mirrors the check order in getMissForDef: a def that failed a later check
// came closer to matching, so its miss reason is more actionable.
const missCloseness: Record<PreAggregateMissReason, number> = {
    // Query-level reasons resolved before the per-definition loop.
    [PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED]: 0,
    [PreAggregateMissReason.CUSTOM_SQL_METRIC]: 0,
    [PreAggregateMissReason.CUSTOM_METRIC_PRESENT]: 0,
    [PreAggregateMissReason.TABLE_CALCULATION_PRESENT]: 0,
    [PreAggregateMissReason.USER_BYPASS]: 0,
    [PreAggregateMissReason.EXPLORE_RESOLUTION_ERROR]: 0,
    [PreAggregateMissReason.NO_ACTIVE_MATERIALIZATION]: 0,
    [PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE]: 0,
    [PreAggregateMissReason.NON_ADDITIVE_METRIC]: 1,
    [PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH]: 1,
    [PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT]: 2,
    [PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE]: 2,
    [PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE]: 3,
    [PreAggregateMissReason.SQL_FILTER_FIELD_NOT_IN_PRE_AGGREGATE]: 4,
    [PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED]: 5,
    [PreAggregateMissReason.GRANULARITY_TOO_FINE]: 6,
    [PreAggregateMissReason.TIME_FRAME_NOT_DERIVABLE]: 6,
};

const isRawTimeInterval = (timeInterval: TimeFrames | undefined): boolean =>
    !timeInterval || timeInterval === TimeFrames.RAW;

// Exact match (see docs/pre-aggregates/CONTEXT.md): selected dimensions
// set-equal to the definition's, time dimension at exactly its granularity.
const isExactDimensionSetMatch = ({
    metricQuery,
    explore,
    preAggregateDef,
    defDimensions,
    dimensionsByFieldId,
    customDimensionIds,
}: {
    metricQuery: MetricQuery;
    explore: Explore;
    preAggregateDef: PreAggregateDef;
    defDimensions: ReadonlySet<string>;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
    customDimensionIds: ReadonlySet<string>;
}): boolean => {
    const coveredDefDimensions = new Set<string>();

    for (const fieldId of metricQuery.dimensions) {
        if (customDimensionIds.has(fieldId)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        const dimension = dimensionsByFieldId.get(fieldId);
        if (!dimension) {
            return false;
        }

        const matchedReferences = getDimensionReferences({
            dimension,
            baseTable: explore.baseTable,
        }).filter((reference) => defDimensions.has(reference));
        if (matchedReferences.length === 0) {
            return false;
        }

        const isDefTimeDimension =
            !!preAggregateDef.timeDimension &&
            !!preAggregateDef.granularity &&
            getDimensionBaseName(dimension) === preAggregateDef.timeDimension;
        if (isDefTimeDimension) {
            if (
                getEffectiveDimensionTimeFrame(dimension) !==
                preAggregateDef.granularity
            ) {
                return false;
            }
        } else if (!isRawTimeInterval(dimension.timeInterval)) {
            // A truncated variant is exact only when truncation is an
            // identity on the stored raw values (e.g. day alias of a DATE).
            const baseDimension = dimensionsByFieldId.get(
                convertFieldRefToFieldId(
                    `${dimension.table}.${getDimensionBaseName(dimension)}`,
                    explore.baseTable,
                ),
            );
            if (
                !baseDimension ||
                getEffectiveDimensionTimeFrame(dimension) !==
                    getEffectiveDimensionTimeFrame(baseDimension)
            ) {
                return false;
            }
        }

        matchedReferences.forEach((reference) =>
            coveredDefDimensions.add(reference),
        );
    }

    return [...defDimensions].every((reference) =>
        coveredDefDimensions.has(reference),
    );
};

const getGranularityMissForDef = (
    metricQuery: MetricQuery,
    explore: Explore,
    preAggregateDef: PreAggregateDef,
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >,
): Extract<
    PreAggregateMatchMiss,
    {
        reason:
            | PreAggregateMissReason.GRANULARITY_TOO_FINE
            | PreAggregateMissReason.TIME_FRAME_NOT_DERIVABLE;
    }
> | null => {
    if (!preAggregateDef.timeDimension || !preAggregateDef.granularity) {
        return null;
    }

    for (const dimensionFieldId of metricQuery.dimensions) {
        const dimension = dimensionsByFieldId.get(dimensionFieldId);
        const queryGranularity = dimension
            ? getEffectiveDimensionTimeFrame(dimension)
            : undefined;
        const matchesPreAggregateTimeDimension =
            !!dimension &&
            !!queryGranularity &&
            getDimensionBaseName(dimension) === preAggregateDef.timeDimension;
        const derivability = queryGranularity
            ? getTimeFrameDerivability(
                  queryGranularity,
                  preAggregateDef.granularity,
              )
            : TimeFrameDerivability.DERIVABLE;

        if (
            matchesPreAggregateTimeDimension &&
            derivability !== TimeFrameDerivability.DERIVABLE
        ) {
            if (
                derivability ===
                TimeFrameDerivability.QUERY_GRANULARITY_TOO_FINE
            ) {
                return {
                    reason: PreAggregateMissReason.GRANULARITY_TOO_FINE,
                    fieldId: dimensionFieldId,
                    queryGranularity,
                    preAggregateGranularity: preAggregateDef.granularity,
                    preAggregateTimeDimension: preAggregateDef.timeDimension,
                };
            }

            return {
                reason: PreAggregateMissReason.TIME_FRAME_NOT_DERIVABLE,
                fieldId: dimensionFieldId,
                queryGranularity,
                preAggregateGranularity: preAggregateDef.granularity,
                preAggregateTimeDimension: preAggregateDef.timeDimension,
            };
        }
    }

    return null;
};

const getMissForDef = ({
    metricQuery,
    explore,
    preAggregateDef,
    dimensionsByFieldId,
    metricsByFieldId,
    unoverriddenRequiredFilterTargetFieldIds,
    requiredFilterTargetFieldIds,
    sqlFilterFieldIds,
}: {
    metricQuery: MetricQuery;
    explore: Explore;
    preAggregateDef: PreAggregateDef;
    dimensionsByFieldId: Map<
        FieldId,
        Explore['tables'][string]['dimensions'][string]
    >;
    metricsByFieldId: ReturnType<typeof getMetricsMapFromTables>;
    unoverriddenRequiredFilterTargetFieldIds: readonly FieldId[];
    requiredFilterTargetFieldIds: ReadonlySet<FieldId>;
    sqlFilterFieldIds: readonly FieldId[];
}): PreAggregateMatchMiss | null => {
    const defDimensions = new Set(preAggregateDef.dimensions);
    if (
        preAggregateDef.timeDimension &&
        preAggregateDef.granularity &&
        !defDimensions.has(preAggregateDef.timeDimension)
    ) {
        defDimensions.add(preAggregateDef.timeDimension);
    }
    const customDimensionIds = new Set(
        (metricQuery.customDimensions || []).map(getItemId),
    );

    let exactDimensionSetMatch: boolean | null = null;
    const isExactMatch = (): boolean => {
        if (exactDimensionSetMatch === null) {
            exactDimensionSetMatch = isExactDimensionSetMatch({
                metricQuery,
                explore,
                preAggregateDef,
                defDimensions,
                dimensionsByFieldId,
                customDimensionIds,
            });
        }
        return exactDimensionSetMatch;
    };

    const defMetrics = new Set(preAggregateDef.metrics);
    for (const metricFieldId of metricQuery.metrics) {
        const metric = metricsByFieldId[metricFieldId];
        if (!metric) {
            return {
                reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
                fieldId: metricFieldId,
            };
        }

        const isMetricInDef = getMetricReferences({
            metric,
            baseTable: explore.baseTable,
        }).some((reference) => defMetrics.has(reference));
        if (!isMetricInDef) {
            return {
                reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
                fieldId: metricFieldId,
            };
        }

        if (metric.type === MetricType.NUMBER) {
            // eslint-disable-next-line no-continue
            continue;
        }
        const representation = getMetricRepresentation(metric.type);
        switch (representation.kind) {
            case PreAggregateMetricRepresentationKind.DIRECT:
            case PreAggregateMetricRepresentationKind.DECOMPOSED:
                break;
            case PreAggregateMetricRepresentationKind.EXACT_ONLY:
                if (!isExactMatch()) {
                    return {
                        reason: PreAggregateMissReason.NON_ADDITIVE_METRIC_REQUIRES_EXACT_MATCH,
                        fieldId: metricFieldId,
                    };
                }
                break;
            case PreAggregateMetricRepresentationKind.UNSUPPORTED:
                return {
                    reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
                    fieldId: metricFieldId,
                };
            default:
                return assertUnreachable(
                    representation,
                    'Unknown pre-aggregate metric representation',
                );
        }
    }

    const missingCustomDimension = (metricQuery.customDimensions || []).find(
        (customDimension) => {
            if (isCustomSqlDimension(customDimension)) {
                return true;
            }

            return (
                isCustomBinDimension(customDimension) &&
                !dimensionFieldIdMatchesDef(
                    customDimension.dimensionId,
                    explore,
                    defDimensions,
                    dimensionsByFieldId,
                )
            );
        },
    );
    if (missingCustomDimension) {
        if (isCustomSqlDimension(missingCustomDimension)) {
            return {
                reason: PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT,
            };
        }

        return {
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: getItemId(missingCustomDimension),
        };
    }

    const missingQueryDimensionFieldId = metricQuery.dimensions.find(
        (dimensionFieldId) =>
            !customDimensionIds.has(dimensionFieldId) &&
            !dimensionFieldIdMatchesDef(
                dimensionFieldId,
                explore,
                defDimensions,
                dimensionsByFieldId,
            ),
    );
    if (missingQueryDimensionFieldId) {
        return {
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: missingQueryDimensionFieldId,
        };
    }

    const filterDimensionFieldIds = [
        ...extractDimensionFilterFieldIds(metricQuery),
        ...unoverriddenRequiredFilterTargetFieldIds,
    ];
    const missingFilterDimensionFieldId = filterDimensionFieldIds.find(
        (dimensionFieldId) =>
            !filterDimensionFieldIdMatchesDef(
                dimensionFieldId,
                explore,
                preAggregateDef,
                defDimensions,
                dimensionsByFieldId,
            ),
    );
    if (missingFilterDimensionFieldId) {
        return {
            reason: PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: missingFilterDimensionFieldId,
        };
    }

    // The model's sql_filter is applied at serve time against materialized
    // columns, so every field it references must be a covered dimension.
    const uncoveredSqlFilterFieldId = sqlFilterFieldIds.find(
        (fieldId) =>
            !filterDimensionFieldIdMatchesDef(
                fieldId,
                explore,
                preAggregateDef,
                defDimensions,
                dimensionsByFieldId,
            ),
    );
    if (uncoveredSqlFilterFieldId) {
        return {
            reason: PreAggregateMissReason.SQL_FILTER_FIELD_NOT_IN_PRE_AGGREGATE,
            fieldId: uncoveredSqlFilterFieldId,
        };
    }

    const overlappingRequiredFilter = preAggregateDef.filters?.find((filter) =>
        [...requiredFilterTargetFieldIds].some((fieldId) => {
            const dimension = dimensionsByFieldId.get(fieldId);
            return (
                !!dimension &&
                dimensionMatchesPreAggregateFilterTarget({
                    dimension,
                    preAggregateFilter: filter,
                    explore,
                })
            );
        }),
    );
    if (overlappingRequiredFilter) {
        return {
            reason: PreAggregateMissReason.PRE_AGGREGATE_FILTER_NOT_SATISFIED,
            fieldId: convertFieldRefToFieldId(
                overlappingRequiredFilter.target.fieldRef,
                explore.baseTable,
            ),
        };
    }

    const unsatisfiedPreAggregateFilterMiss =
        getUnsatisfiedPreAggregateFilterMiss({
            metricQuery,
            explore,
            preAggregateDef,
            dimensionsByFieldId,
        });
    if (unsatisfiedPreAggregateFilterMiss) {
        return unsatisfiedPreAggregateFilterMiss;
    }

    const granularityMiss = getGranularityMissForDef(
        metricQuery,
        explore,
        preAggregateDef,
        dimensionsByFieldId,
    );
    if (granularityMiss) {
        return granularityMiss;
    }

    return null;
};

export const findMatch = (
    metricQuery: MetricQuery,
    explore: Explore,
): PreAggregateMatchResult => {
    if (!explore.preAggregates || explore.preAggregates.length === 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED,
            },
        };
    }

    const sqlTableCalculation = (metricQuery.tableCalculations || []).find(
        isSqlTableCalculation,
    );
    if (sqlTableCalculation) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT,
                fieldId: getItemId(sqlTableCalculation),
            },
        };
    }

    const firstAdditionalMetric = metricQuery.additionalMetrics?.[0];
    if (firstAdditionalMetric) {
        return {
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.CUSTOM_METRIC_PRESENT,
                fieldId: getItemId(firstAdditionalMetric),
            },
        };
    }

    const dimensionsByFieldId = getDimensionsByFieldId(explore);
    const metricsByFieldId = getMetricsMapFromTables(explore.tables);
    const baseTable = explore.tables[explore.baseTable];
    const requiredModelFilters =
        baseTable.requiredFilters?.filter(
            (filter) => filter.required !== false,
        ) ?? [];
    const unoverriddenRequiredFilterTargetFieldIds =
        reduceRequiredDimensionFiltersToFilterRules(
            requiredModelFilters,
            metricQuery.filters.dimensions,
            explore,
        ).map((filter) => filter.target.fieldId);
    const requiredFilterTargetFieldIds = new Set(
        requiredModelFilters.map(
            (filter) =>
                createFilterRuleFromModelRequiredFilterRule(
                    filter,
                    baseTable.name,
                ).target.fieldId,
        ),
    );

    const sqlFilterFieldIds = extractSqlFilterFieldIds(explore);

    const matchedDefs: PreAggregateDef[] = [];
    // Surface the miss from the def that came closest to matching; ties keep
    // YAML definition order.
    let closestMiss: PreAggregateMatchMiss | null = null;
    let closestMissRank = -1;

    explore.preAggregates.forEach((preAggregateDef) => {
        const miss = getMissForDef({
            metricQuery,
            explore,
            preAggregateDef,
            dimensionsByFieldId,
            metricsByFieldId,
            unoverriddenRequiredFilterTargetFieldIds,
            requiredFilterTargetFieldIds,
            sqlFilterFieldIds,
        });

        if (!miss) {
            matchedDefs.push(preAggregateDef);
            return;
        }

        const missRank = missCloseness[miss.reason];
        if (missRank > closestMissRank) {
            closestMiss = miss;
            closestMissRank = missRank;
        }
    });

    if (matchedDefs.length === 0) {
        return {
            hit: false,
            preAggregateName: null,
            miss: closestMiss ?? {
                reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
                fieldId:
                    metricQuery.dimensions[0] ??
                    metricQuery.metrics[0] ??
                    'unknown',
            },
        };
    }

    // Defs without a time dimension have no time expansion, so treat them as coarsest.
    const getGranularityCoarseness = (def: PreAggregateDef): number =>
        def.granularity
            ? getPreAggregateGranularityRank(def.granularity)
            : Number.MAX_SAFE_INTEGER;

    // TODO: Prefer using materialized row count once available.
    const smallestMatchingDef = matchedDefs.reduce((best, current) => {
        if (current.dimensions.length !== best.dimensions.length) {
            return current.dimensions.length < best.dimensions.length
                ? current
                : best;
        }
        const currentCoarseness = getGranularityCoarseness(current);
        const bestCoarseness = getGranularityCoarseness(best);
        if (currentCoarseness !== bestCoarseness) {
            return currentCoarseness > bestCoarseness ? current : best;
        }
        return current.metrics.length < best.metrics.length ? current : best;
    });

    return {
        hit: true,
        preAggregateName: smallestMatchingDef.name,
        miss: null,
    };
};

export const applyUserBypass = (
    matchResult: PreAggregateMatchResult,
    cacheEnabled: boolean,
): PreAggregateMatchResult => {
    if (cacheEnabled || !matchResult.hit) return matchResult;
    return {
        hit: false,
        preAggregateName: null,
        miss: {
            reason: PreAggregateMissReason.USER_BYPASS,
            preAggregateName: matchResult.preAggregateName,
        },
    };
};
