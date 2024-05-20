import dayjs from 'dayjs';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import {
    DimensionType,
    isCustomSqlDimension,
    isDimension,
    isTableCalculation,
    MetricType,
    TableCalculationType,
    type CompiledField,
    type CustomSqlDimension,
    type Field,
    type FilterableDimension,
    type FilterableField,
    type FilterableItem,
    type ItemsMap,
    type Metric,
    type TableCalculation,
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
import { getItemId, getItemType, isDateItem } from './item';

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

export const getFilterTypeFromItem = (item: FilterableField): FilterType => {
    const type = getItemType(item);
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
        case TableCalculationType.STRING:
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
        case TableCalculationType.NUMBER:
            return FilterType.NUMBER;
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
        case TableCalculationType.DATE:
        case TableCalculationType.TIMESTAMP:
            return FilterType.DATE;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
        case TableCalculationType.BOOLEAN:
            return FilterType.BOOLEAN;
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

                const isTimestamp =
                    (isCustomSqlDimension(field)
                        ? field.dimensionType
                        : field.type) === DimensionType.TIMESTAMP;
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
                fieldId: getItemId(field),
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
    field: FilterableDimension | Metric | Field,
    availableTileFilters: Record<string, FilterableDimension[] | undefined>,
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
                fieldId: getItemId(filterableField),
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
    field: FilterableDimension,
    availableTileFilters: Record<string, FilterableDimension[] | undefined>,
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
    field:
        | Exclude<FilterableItem, TableCalculation | CustomSqlDimension>
        | CompiledField;
    availableTileFilters: Record<string, FilterableDimension[] | undefined>;
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
                fieldId: getItemId(field),
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
        if (isDimension(f) || isCustomSqlDimension(f)) {
            return 'dimensions';
        }
        if (isTableCalculation(f)) {
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

/**
 * Takes a filter group and flattens it by merging nested groups into the parent group if they are the same filter group type
 * @param filterGroup - The filter group to flatten
 * @returns Flattened filter group
 */
const flattenSameFilterGroupType = (filterGroup: FilterGroup): FilterGroup => {
    const items = getItemsFromFilterGroup(filterGroup);

    return {
        id: filterGroup.id,
        [getFilterGroupItemsPropertyName(filterGroup)]: items.reduce<
            FilterGroupItem[]
        >((acc, item) => {
            if (isFilterGroup(item)) {
                const flatGroup = flattenSameFilterGroupType(item);

                // If the parent group is the same type as the current group, we merge the current group items into the parent group
                if (
                    getFilterGroupItemsPropertyName(flatGroup) ===
                    getFilterGroupItemsPropertyName(filterGroup)
                ) {
                    return [...acc, ...getItemsFromFilterGroup(flatGroup)];
                }

                // If the parent group is not the same type as the current group, we just add the current group as an item
                return [...acc, flatGroup];
            }

            return [...acc, item];
        }, []),
    } as FilterGroup;
};

/**
 * Checks if a dimension value is an invalid date before it is added to the filter
 * @param item - The field to compare against the value
 * @param value - The value to check
 * @returns True if the value is an invalid date, false otherwise
 */
export const isDimensionValueInvalidDate = (
    item: FilterableField,
    value: any,
) => isDateItem(item) && value.raw === 'Invalid Date'; // Message from moment.js when it can't parse a date

/**
 * Takes a filter group and build a filters object from it based on the field type
 * @param filterGroup - The filter group to extract filters from
 * @param fields - Fields to compare against the filter group items to determine types
 * @returns Filters object with dimensions, metrics, and table calculations
 */
export const getFiltersFromGroup = (
    filterGroup: FilterGroup,
    fields: ItemsMap[string][],
): Filters => {
    const flatFilterGroup = flattenSameFilterGroupType(filterGroup);
    const items = getItemsFromFilterGroup(flatFilterGroup);

    return items.reduce<Filters>((accumulator, item) => {
        if (isFilterRule(item)) {
            // when filter group item is a filter rule, we find the field it's targeting
            const fieldInRule = fields.find(
                (field) => getItemId(field) === item.target.fieldId,
            );

            // determine the type of the field and add the rule it to the correct filters object property
            // always keep the parent filter group type (AND/OR) when adding the filter rules
            if (fieldInRule) {
                if (
                    isDimension(fieldInRule) ||
                    isCustomSqlDimension(fieldInRule)
                ) {
                    accumulator.dimensions = {
                        id: uuidv4(),
                        ...accumulator.dimensions,
                        [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
                            ...getItemsFromFilterGroup(accumulator.dimensions),
                            item,
                        ],
                    } as FilterGroup;
                } else if (isTableCalculation(fieldInRule)) {
                    accumulator.tableCalculations = {
                        id: uuidv4(),
                        ...accumulator.tableCalculations,
                        [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
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
                        [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
                            ...getItemsFromFilterGroup(accumulator.metrics),
                            item,
                        ],
                    } as FilterGroup;
                }
            }
        }

        if (isFilterGroup(item)) {
            // when filter group item is a filter group, we need to recursively call this function to extract filters objects from the nested group
            // then we add each field type filter group - from nested filters group - into the correct parent filters object property keeping the parent filter group type (AND/OR)
            const filters = getFiltersFromGroup(item, fields);

            if (filters.dimensions) {
                accumulator.dimensions = {
                    id: uuidv4(),
                    ...accumulator.dimensions,
                    [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
                        ...getItemsFromFilterGroup(accumulator.dimensions),
                        filters.dimensions,
                    ],
                } as FilterGroup;
            }

            if (filters.metrics) {
                accumulator.metrics = {
                    id: uuidv4(),
                    ...accumulator.metrics,
                    [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
                        ...getItemsFromFilterGroup(accumulator.metrics),
                        filters.metrics,
                    ],
                } as FilterGroup;
            }

            if (filters.tableCalculations) {
                accumulator.tableCalculations = {
                    id: uuidv4(),
                    ...accumulator.tableCalculations,
                    [getFilterGroupItemsPropertyName(flatFilterGroup)]: [
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

export const deleteFilterRuleFromGroup = (
    filterGroup: FilterGroup,
    id: string,
) => {
    const items = getItemsFromFilterGroup(filterGroup);

    // If the filter group contains the rule we want to delete, we remove it
    if (items.some((rule) => rule.id === id)) {
        return {
            id: filterGroup.id,
            [getFilterGroupItemsPropertyName(filterGroup)]: items.filter(
                (rule) => rule.id !== id,
            ),
        } as FilterGroup;
    }

    const groupGroups = items.filter(isFilterGroup);
    const groupItems = items.filter(isFilterRule);

    // If the filter group contains nested groups, we recursively call this function on each nested group
    const newGroups: FilterGroup[] = groupGroups.map((group) =>
        deleteFilterRuleFromGroup(group, id),
    );

    return {
        id: filterGroup.id,
        [getFilterGroupItemsPropertyName(filterGroup)]: [
            ...groupItems,
            ...newGroups,
        ],
    } as FilterGroup;
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
        ? filterRulesList.find((x) => x.target.fieldId === item.target.fieldId)
        : undefined;
    return identicalDashboardFilter
        ? {
              ...item,
              id: identicalDashboardFilter.id,
              values: identicalDashboardFilter.values,
              ...(identicalDashboardFilter.settings
                  ? {
                        settings: identicalDashboardFilter.settings,
                    }
                  : {}),
              operator: identicalDashboardFilter.operator,
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

const getDeduplicatedFilterRules = (
    filterRules: FilterRule[],
    filterGroup?: FilterGroup,
): FilterRule[] => {
    const groupFilterRules = getFilterRulesFromGroup(filterGroup);
    return filterRules.filter(
        (rule) =>
            !groupFilterRules.some((groupRule) => groupRule.id === rule.id),
    );
};

const overrideFilterGroupWithFilterRules = (
    filterGroup: FilterGroup | undefined,
    filterRules: FilterRule[],
): FilterGroup => {
    if (!filterGroup) {
        return {
            id: uuidv4(),
            and: filterRules,
        };
    }

    const overriddenGroup = overrideChartFilter(filterGroup, filterRules);

    // deduplicate the dashboard filter rules from the ones used when overriding the chart filterGroup
    const deduplicatedRules = getDeduplicatedFilterRules(
        filterRules,
        overriddenGroup,
    );

    // if it's AND group we don't need to sub-group the rules - all can be in the same group
    // if it's OR group we need to sub-group the rules
    const overridenGroupItems = isAndFilterGroup(overriddenGroup)
        ? overriddenGroup.and
        : [overriddenGroup];

    return {
        id: uuidv4(),
        and: [...overridenGroupItems, ...deduplicatedRules],
    };
};

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
): MetricQuery => ({
    ...metricQuery,
    filters: {
        dimensions: overrideFilterGroupWithFilterRules(
            metricQuery.filters?.dimensions,
            dashboardFilters.dimensions.map(
                convertDashboardFilterRuleToFilterRule,
            ),
        ),
        metrics: overrideFilterGroupWithFilterRules(
            metricQuery.filters?.metrics,
            dashboardFilters.metrics.map(
                convertDashboardFilterRuleToFilterRule,
            ),
        ),
        tableCalculations: overrideFilterGroupWithFilterRules(
            metricQuery.filters?.tableCalculations,
            dashboardFilters.tableCalculations.map(
                convertDashboardFilterRuleToFilterRule,
            ),
        ),
    },
});
