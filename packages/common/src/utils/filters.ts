import dayjs from 'dayjs';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import {
    CustomFormatType,
    DimensionType,
    fieldId,
    isDimension,
    isFilterableDimension,
    isTableCalculation,
    isTableCalculationField,
    MetricType,
    type Dimension,
    type Field,
    type FilterableDimension,
    type FilterableField,
    type FilterableItem,
} from '../types/field';
import {
    FilterOperator,
    FilterType,
    isAndFilterGroup,
    isFilterGroup,
    isFilterRule,
    UnitOfTime,
    type AndFilterGroup,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardFilters,
    type DateFilterRule,
    type FilterDashboardToRule,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type OrFilterGroup,
} from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { formatDate } from './formatting';

export const getFilterRulesFromGroup = (
    filterGroup: FilterGroup | undefined,
): FilterRule[] => {
    if (filterGroup) {
        const items = isAndFilterGroup(filterGroup)
            ? filterGroup.and
            : filterGroup.or;
        return items.reduce<FilterRule[]>(
            (sum, item) =>
                isFilterGroup(item)
                    ? [...sum, ...getFilterRulesFromGroup(item)]
                    : [...sum, item],
            [],
        );
    }
    return [];
};

export const getTotalFilterRules = (filters: Filters): FilterRule[] => [
    ...getFilterRulesFromGroup(filters.dimensions),
    ...getFilterRulesFromGroup(filters.metrics),
    ...getFilterRulesFromGroup(filters.tableCalculations),
];

export const countTotalFilterRules = (filters: Filters): number =>
    getTotalFilterRules(filters).length;

export const hasNestedGroups = (filters: Filters): boolean => {
    const hasGroups = (filterGroup: FilterGroup): boolean => {
        const items = isAndFilterGroup(filterGroup)
            ? filterGroup.and
            : filterGroup.or;
        return items.some(isFilterGroup);
    };
    return (
        (!!filters.dimensions && hasGroups(filters.dimensions)) ||
        (!!filters.metrics && hasGroups(filters.metrics)) ||
        (!!filters.tableCalculations && hasGroups(filters.tableCalculations))
    );
};

export const getItemsFromFilterGroup = (
    filterGroup: FilterGroup | undefined,
): FilterGroupItem[] => {
    if (filterGroup) {
        return isAndFilterGroup(filterGroup) ? filterGroup.and : filterGroup.or;
    }
    return [];
};

export const getFilterGroupItemsPropertyName = (
    filterGroup: FilterGroup | undefined,
): 'and' | 'or' => {
    if (filterGroup) {
        return isAndFilterGroup(filterGroup) ? 'and' : 'or';
    }
    return 'and';
};

export const filterableDimensionsOnly = (
    dimensions: Dimension[],
): FilterableDimension[] => dimensions.filter(isFilterableDimension);

export const getFilterTypeFromItem = (item: FilterableItem): FilterType => {
    if (isTableCalculation(item)) {
        return FilterType.NUMBER;
    }

    const { type } = item;

    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
            return FilterType.STRING;
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
            return FilterType.NUMBER;
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
            return FilterType.DATE;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return FilterType.BOOLEAN;
        case CustomFormatType.DEFAULT:
        case CustomFormatType.ID:
            return FilterType.STRING;
        case CustomFormatType.CURRENCY:
        case CustomFormatType.PERCENT:
        case CustomFormatType.NUMBER:
            return FilterType.NUMBER;
        default: {
            return assertUnreachable(
                type,
                `No filter type found for field type: ${type}`,
            );
        }
    }
};

export const getFilterRuleWithDefaultValue = <T extends FilterRule>(
    field: FilterableField,
    filterRule: T,
    values?: any[] | null,
): T => {
    const filterType = getFilterTypeFromItem(field);
    const filterRuleDefaults: Partial<FilterRule> = {};

    if (
        ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
            filterRule.operator,
        ) &&
        values !== null
    ) {
        switch (filterType) {
            case FilterType.DATE: {
                const value = values ? values[0] : undefined;

                const isTimestamp = field.type === DimensionType.TIMESTAMP;
                if (
                    filterRule.operator === FilterOperator.IN_THE_PAST ||
                    filterRule.operator === FilterOperator.NOT_IN_THE_PAST ||
                    filterRule.operator === FilterOperator.IN_THE_NEXT ||
                    filterRule.operator === FilterOperator.IN_THE_CURRENT
                ) {
                    const numberValue =
                        value === undefined || typeof value !== 'number'
                            ? 1
                            : value;

                    filterRuleDefaults.values = [numberValue];
                    filterRuleDefaults.settings = {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    } as DateFilterRule['settings'];
                } else if (isTimestamp) {
                    const valueIsDate =
                        value !== undefined && typeof value !== 'number';

                    // NOTE: Using .format() makes this a standard ISO string
                    const timestampValue = valueIsDate
                        ? dayjs(value).format()
                        : dayjs().format();

                    filterRuleDefaults.values = [timestampValue];
                } else {
                    const valueIsDate =
                        value !== undefined && typeof value !== 'number';

                    const defaultTimeIntervalValues: Record<
                        string,
                        moment.Moment
                    > = {
                        [TimeFrames.DAY]: moment(),
                        [TimeFrames.WEEK]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('week'),
                        [TimeFrames.MONTH]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('month'),
                        [TimeFrames.YEAR]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('year'),
                    };

                    const defaultDate =
                        isDimension(field) &&
                        field.timeInterval &&
                        defaultTimeIntervalValues[field.timeInterval]
                            ? defaultTimeIntervalValues[field.timeInterval]
                            : moment();

                    const dateValue = valueIsDate
                        ? formatDate(
                              // Treat the date as UTC, then remove its timezone information before formatting
                              moment.utc(value).format('YYYY-MM-DD'),
                              undefined,
                              false,
                          )
                        : formatDate(defaultDate, undefined, false);

                    filterRuleDefaults.values = [dateValue];
                }
                break;
            }
            case FilterType.BOOLEAN: {
                filterRuleDefaults.values =
                    values !== undefined ? values : [false];
                break;
            }
            default:
                break;
        }
    }
    return {
        ...filterRule,
        values: values !== undefined && values !== null ? values : [],
        settings: undefined,
        ...filterRuleDefaults,
    };
};

export const createFilterRuleFromField = (
    field: FilterableField,
    value?: any,
): FilterRule =>
    getFilterRuleWithDefaultValue(
        field,
        {
            id: uuidv4(),
            target: {
                fieldId: fieldId(field),
            },
            operator:
                value === null ? FilterOperator.NULL : FilterOperator.EQUALS,
        },
        value ? [value] : [],
    );

export const matchFieldExact = (a: Field) => (b: Field) =>
    a.type === b.type && a.name === b.name && a.table === b.table;

export const matchFieldByTypeAndName = (a: Field) => (b: Field) =>
    a.type === b.type && a.name === b.name;

export const matchFieldByType = (a: Field) => (b: Field) => a.type === b.type;

const getDefaultTileTargets = (
    field: FilterableField,
    availableTileFilters: Record<string, FilterableField[] | undefined>,
) =>
    Object.entries(availableTileFilters).reduce<
        Record<string, DashboardFieldTarget>
    >((acc, [tileUuid, availableFilters]) => {
        if (!availableFilters) return acc;

        const filterableField = availableFilters.find(matchFieldExact(field));
        if (!filterableField) return acc;

        return {
            ...acc,
            [tileUuid]: {
                fieldId: fieldId(filterableField),
                tableName: filterableField.table,
            },
        };
    }, {});

export const applyDefaultTileTargets = (
    filterRule: DashboardFilterRule<
        FilterOperator,
        DashboardFieldTarget,
        any,
        any
    >,
    field: FilterableField,
    availableTileFilters: Record<string, FilterableField[] | undefined>,
) => {
    if (!filterRule.tileTargets) {
        return {
            ...filterRule,
            tileTargets: getDefaultTileTargets(field, availableTileFilters),
        };
    }
    return filterRule;
};

export const createDashboardFilterRuleFromField = ({
    field,
    availableTileFilters,
    isTemporary,
    value,
}: {
    field: FilterableField;
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    isTemporary: boolean;
    value?: unknown;
}): FilterDashboardToRule =>
    getFilterRuleWithDefaultValue(
        field,
        {
            id: uuidv4(),
            operator:
                value === null ? FilterOperator.NULL : FilterOperator.EQUALS,
            target: {
                fieldId: fieldId(field),
                tableName: field.table,
                fieldName: field.name,
            },
            tileTargets: getDefaultTileTargets(field, availableTileFilters),
            disabled: !isTemporary,
            label: undefined,
        },
        value ? [value] : null, // When `null`, don't set default value if no value is provided
    );

type AddFilterRuleArgs = {
    filters: Filters;
    field: FilterableField;
    value?: any;
};

export const addFilterRule = ({
    filters,
    field,
    value,
}: AddFilterRuleArgs): Filters => {
    const groupKey = ((f: any) => {
        if (isDimension(f)) {
            return 'dimensions';
        }
        if (isTableCalculationField(f)) {
            return 'tableCalculations';
        }
        return 'metrics';
    })(field);
    const group = filters[groupKey];
    return {
        ...filters,
        [groupKey]: {
            id: uuidv4(),
            ...group,
            [getFilterGroupItemsPropertyName(group)]: [
                ...getItemsFromFilterGroup(group),
                createFilterRuleFromField(field, value),
            ],
        },
    };
};

export const getFilterRulesByFieldType = (
    fields: Field[],
    filterRules: FilterRule[],
) =>
    filterRules.reduce<
        Record<
            'valid' | 'invalid',
            Record<'dimensions' | 'metrics' | 'tableCalculations', FilterRule[]>
        >
    >(
        (accumulator, filterRule) => {
            const fieldInRule = fields.find(
                (field) => fieldId(field) === filterRule.target.fieldId,
            );

            const updateAccumulator = (
                key: 'valid' | 'invalid',
                rule: FilterRule,
            ) => {
                if (isDimension(fieldInRule)) {
                    accumulator[key].dimensions.push(rule);
                } else if (isTableCalculationField(fieldInRule)) {
                    accumulator[key].tableCalculations.push(rule);
                } else {
                    accumulator[key].metrics.push(rule);
                }
            };

            if (fieldInRule) {
                updateAccumulator('valid', filterRule);
            } else {
                updateAccumulator('invalid', filterRule);
            }

            return accumulator;
        },
        {
            valid: { dimensions: [], metrics: [], tableCalculations: [] },
            invalid: { dimensions: [], metrics: [], tableCalculations: [] },
        },
    );

export const getFiltersFromGroup = (
    filterGroup: FilterGroup,
    fields: Field[],
): Filters => {
    const items = getItemsFromFilterGroup(filterGroup);
    return items.reduce<Filters>((accumulator, item) => {
        if (isFilterRule(item)) {
            const fieldInRule = fields.find(
                (field) => fieldId(field) === item.target.fieldId,
            );

            if (fieldInRule) {
                if (isDimension(fieldInRule)) {
                    accumulator.dimensions = {
                        id: uuidv4(),
                        ...accumulator.dimensions,
                        [getFilterGroupItemsPropertyName(filterGroup)]: [
                            ...getItemsFromFilterGroup(accumulator.dimensions),
                            item,
                        ],
                    } as FilterGroup;
                } else if (isTableCalculationField(fieldInRule)) {
                    accumulator.tableCalculations = {
                        id: uuidv4(),
                        ...accumulator.tableCalculations,
                        [getFilterGroupItemsPropertyName(filterGroup)]: [
                            ...getItemsFromFilterGroup(
                                accumulator.tableCalculations,
                            ),
                            item,
                        ],
                    } as FilterGroup;
                } else {
                    accumulator.metrics = {
                        id: uuidv4(),
                        ...accumulator.metrics,
                        [getFilterGroupItemsPropertyName(filterGroup)]: [
                            ...getItemsFromFilterGroup(accumulator.metrics),
                            item,
                        ],
                    } as FilterGroup;
                }
            }
        }

        if (isFilterGroup(item)) {
            const filters = getFiltersFromGroup(item, fields);

            if (filters.dimensions) {
                accumulator.dimensions = {
                    id: uuidv4(),
                    ...accumulator.dimensions,
                    [getFilterGroupItemsPropertyName(accumulator.dimensions)]: [
                        ...getItemsFromFilterGroup(accumulator.dimensions),
                        filters.dimensions,
                    ],
                } as FilterGroup;
            }

            if (filters.metrics) {
                accumulator.metrics = {
                    id: uuidv4(),
                    ...accumulator.metrics,
                    [getFilterGroupItemsPropertyName(accumulator.metrics)]: [
                        ...getItemsFromFilterGroup(accumulator.metrics),
                        filters.metrics,
                    ],
                } as FilterGroup;
            }

            if (filters.tableCalculations) {
                accumulator.tableCalculations = {
                    id: uuidv4(),
                    ...accumulator.tableCalculations,
                    [getFilterGroupItemsPropertyName(
                        accumulator.tableCalculations,
                    )]: [
                        ...getItemsFromFilterGroup(
                            accumulator.tableCalculations,
                        ),
                        filters.tableCalculations,
                    ],
                } as FilterGroup;
            }
        }

        return accumulator;
    }, {} as Filters);
};

export const getDashboardFilterRulesForTile = (
    tileUuid: string,
    rules: DashboardFilterRule[],
): DashboardFilterRule[] =>
    rules
        .filter((rule) => !rule.disabled)
        .map((filter) => {
            const tileConfig = filter.tileTargets?.[tileUuid];

            // If the config is false, we remove this filter
            if (tileConfig === false) {
                return null;
            }
            // If the tile isn't in the tileTarget overrides,
            // we return the filter and don't treat this tile
            // differently.
            if (tileConfig === undefined) {
                return filter;
            }

            return {
                ...filter,
                target: {
                    fieldId: tileConfig.fieldId,
                    tableName: tileConfig.tableName,
                },
            };
        })
        .filter((f): f is DashboardFilterRule => f !== null);

export const getDashboardFilterRulesForTables = (
    tables: string[],
    rules: DashboardFilterRule[],
): DashboardFilterRule[] =>
    rules.filter((f) => tables.includes(f.target.tableName));

export const getDashboardFilterRulesForTileAndTables = (
    tileUuid: string,
    tables: string[],
    rules: DashboardFilterRule[],
): DashboardFilterRule[] =>
    getDashboardFilterRulesForTables(
        tables,
        getDashboardFilterRulesForTile(tileUuid, rules),
    );

export const getDashboardFiltersForTileAndTables = (
    tileUuid: string,
    tables: string[],
    dashboardFilters: DashboardFilters,
): DashboardFilters => ({
    dimensions: getDashboardFilterRulesForTileAndTables(
        tileUuid,
        tables,
        dashboardFilters.dimensions,
    ),
    metrics: getDashboardFilterRulesForTileAndTables(
        tileUuid,
        tables,
        dashboardFilters.metrics,
    ),
    tableCalculations: getDashboardFilterRulesForTileAndTables(
        tileUuid,
        tables,
        dashboardFilters.tableCalculations,
    ),
});

const combineFilterGroups = (
    a: FilterGroup | undefined,
    b: FilterGroup | undefined,
): FilterGroup => ({
    id: uuidv4(),
    and: [a, b].filter((f): f is FilterGroup => !!f),
});

export const addFiltersToMetricQuery = (
    metricQuery: MetricQuery,
    filters: Filters,
): MetricQuery => ({
    ...metricQuery,
    filters: {
        dimensions: combineFilterGroups(
            metricQuery.filters?.dimensions,
            filters.dimensions,
        ),
        metrics: combineFilterGroups(
            metricQuery.filters?.metrics,
            filters.metrics,
        ),
        tableCalculations: combineFilterGroups(
            metricQuery.filters?.tableCalculations,
            filters.tableCalculations,
        ),
    },
});

const findAndOverrideChartFilter = (
    item: FilterGroupItem,
    filterRulesList: FilterRule[],
): FilterGroupItem => {
    const identicalDashboardFilter = isFilterRule(item)
        ? filterRulesList.find(
              (x) =>
                  x.target.fieldId === item.target.fieldId &&
                  x.operator === item.operator,
          )
        : undefined;
    return identicalDashboardFilter
        ? {
              ...item,
              values: identicalDashboardFilter.values,
          }
        : item;
};

export const overrideChartFilter = (
    filterGroup: AndFilterGroup | OrFilterGroup,
    filterRules: FilterRule[],
): FilterGroup =>
    isAndFilterGroup(filterGroup)
        ? {
              id: filterGroup.id,
              and: filterGroup.and.map((item) =>
                  findAndOverrideChartFilter(item, filterRules),
              ),
          }
        : {
              id: filterGroup.id,
              or: filterGroup.or.map((item) =>
                  findAndOverrideChartFilter(item, filterRules),
              ),
          };

const overrideFilterGroupWithFilterRules = (
    filterGroup: FilterGroup | undefined,
    filterRules: FilterRule[],
): FilterGroup => ({
    id: uuidv4(),
    and: [
        ...(filterGroup ? [overrideChartFilter(filterGroup, filterRules)] : []),
        ...filterRules,
    ],
});

const combineFilterGroupWithFilterRules = (
    filterGroup: FilterGroup | undefined,
    filterRules: FilterRule[],
): FilterGroup => ({
    id: uuidv4(),
    and: [...(filterGroup ? [filterGroup] : []), ...filterRules],
});

const convertDashboardFilterRuleToFilterRule = (
    dashboardFilterRule: DashboardFilterRule,
): FilterRule => ({
    id: dashboardFilterRule.id,
    target: {
        fieldId: dashboardFilterRule.target.fieldId,
    },
    operator: dashboardFilterRule.operator,
    values: dashboardFilterRule.values,
    ...(dashboardFilterRule.settings && {
        settings: dashboardFilterRule.settings,
    }),
    ...(dashboardFilterRule.disabled && {
        disabled: dashboardFilterRule.disabled,
    }),
});

export const addDashboardFiltersToMetricQuery = (
    metricQuery: MetricQuery,
    dashboardFilters: DashboardFilters,
    shouldOverride: boolean,
): MetricQuery => {
    const mergeStrategy = shouldOverride
        ? overrideFilterGroupWithFilterRules
        : combineFilterGroupWithFilterRules;
    return {
        ...metricQuery,
        filters: {
            dimensions: mergeStrategy(
                metricQuery.filters?.dimensions,
                dashboardFilters.dimensions.map(
                    convertDashboardFilterRuleToFilterRule,
                ),
            ),
            metrics: mergeStrategy(
                metricQuery.filters?.metrics,
                dashboardFilters.metrics.map(
                    convertDashboardFilterRuleToFilterRule,
                ),
            ),
            tableCalculations: mergeStrategy(
                metricQuery.filters?.tableCalculations,
                dashboardFilters.tableCalculations.map(
                    convertDashboardFilterRuleToFilterRule,
                ),
            ),
        },
    };
};
