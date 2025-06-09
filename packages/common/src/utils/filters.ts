import dayjs from 'dayjs';
import isNil from 'lodash/isNil';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { type AnyType } from '../types/any';
import { DashboardTileTypes, type DashboardTile } from '../types/dashboard';
import { type Explore } from '../types/explore';
import {
    DimensionType,
    MetricType,
    TableCalculationType,
    convertFieldRefToFieldId,
    isCustomSqlDimension,
    isDimension,
    isTableCalculation,
    type CompiledField,
    type CustomSqlDimension,
    type Dimension,
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
    UnitOfTime,
    isAndFilterGroup,
    isFilterGroup,
    isFilterRule,
    isFilterRuleDefinedForFieldId,
    isJoinModelRequiredFilter,
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
    type ModelRequiredFilterRule,
    type OrFilterGroup,
    type TimeBasedOverrideMap,
} from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import { type ResultColumn } from '../types/results';
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

export const getFilterTypeFromItemType = (
    type: DimensionType | MetricType | TableCalculationType,
): FilterType => {
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

export const getFilterTypeFromItem = (item: FilterableField): FilterType => {
    const type = getItemType(item);
    return getFilterTypeFromItemType(type);
};

export const timeframeToUnitOfTime = (timeframe: TimeFrames) => {
    switch (timeframe) {
        case TimeFrames.MILLISECOND:
            return UnitOfTime.milliseconds;
        case TimeFrames.SECOND:
            return UnitOfTime.seconds;
        case TimeFrames.MINUTE:
            return UnitOfTime.minutes;
        case TimeFrames.HOUR:
            return UnitOfTime.hours;
        case TimeFrames.DAY:
            return UnitOfTime.days;
        case TimeFrames.WEEK:
            return UnitOfTime.weeks;
        case TimeFrames.MONTH:
            return UnitOfTime.months;
        case TimeFrames.QUARTER:
            return UnitOfTime.quarters;
        case TimeFrames.YEAR:
            return UnitOfTime.years;
        default:
            return undefined;
    }
};

export const supportsSingleValue = (
    filterType: FilterType,
    filterOperator: FilterOperator,
) =>
    [FilterType.STRING, FilterType.NUMBER].includes(filterType) &&
    [
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.STARTS_WITH,
        FilterOperator.ENDS_WITH,
        FilterOperator.INCLUDE,
        FilterOperator.NOT_INCLUDE,
    ].includes(filterOperator);

export const isWithValueFilter = (filterOperator: FilterOperator) =>
    filterOperator !== FilterOperator.NULL &&
    filterOperator !== FilterOperator.NOT_NULL;

export const getFilterRuleWithDefaultValue = <T extends FilterRule>(
    filterType: FilterType,
    field: FilterableField | undefined,
    filterRule: T,
    values?: AnyType[] | null,
): T => {
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
                    !field ||
                    (isCustomSqlDimension(field)
                        ? field.dimensionType
                        : field.type) === DimensionType.TIMESTAMP;
                if (
                    filterRule.operator === FilterOperator.IN_THE_PAST ||
                    filterRule.operator === FilterOperator.NOT_IN_THE_PAST ||
                    filterRule.operator === FilterOperator.IN_THE_NEXT ||
                    filterRule.operator === FilterOperator.IN_THE_CURRENT ||
                    filterRule.operator === FilterOperator.NOT_IN_THE_CURRENT
                ) {
                    const numberValue =
                        value === undefined || typeof value !== 'number'
                            ? 1
                            : value;
                    const defaultUnitOfTime =
                        isDimension(field) && field.timeInterval
                            ? timeframeToUnitOfTime(field.timeInterval)
                            : UnitOfTime.days;
                    filterRuleDefaults.values = [numberValue];
                    filterRuleDefaults.settings = {
                        unitOfTime: defaultUnitOfTime,
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
                        [TimeFrames.QUARTER]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('quarter'),
                        [TimeFrames.MONTH]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('month'),
                        [TimeFrames.YEAR]: moment(
                            valueIsDate ? value : undefined,
                        ).startOf('year'),
                    };

                    const fieldTimeInterval =
                        isDimension(field) && field.timeInterval
                            ? field.timeInterval
                            : undefined;

                    const defaultDate =
                        fieldTimeInterval &&
                        defaultTimeIntervalValues[fieldTimeInterval]
                            ? defaultTimeIntervalValues[fieldTimeInterval]
                            : moment();

                    const dateValue = valueIsDate
                        ? formatDate(
                              // Treat the date as UTC, then remove its timezone information before formatting
                              moment.utc(value).format('YYYY-MM-DD'),
                              // For QUARTER, we don't want to use the field's time interval(YYYY-[Q]Q) because the date is already in the correct format when generating the SQL
                              fieldTimeInterval === TimeFrames.QUARTER
                                  ? undefined
                                  : fieldTimeInterval, // Use the field's time interval if it has one
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

export const getFilterRuleFromFieldWithDefaultValue = <T extends FilterRule>(
    field: FilterableField,
    filterRule: T,
    values?: AnyType[] | null,
): T =>
    getFilterRuleWithDefaultValue(
        getFilterTypeFromItem(field),
        field,
        filterRule,
        values,
    );

export const createFilterRuleFromField = (
    field: FilterableField,
    value?: AnyType,
): FilterRule =>
    getFilterRuleFromFieldWithDefaultValue(
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

export const isTileFilterable = (tile: DashboardTile) =>
    ![DashboardTileTypes.MARKDOWN, DashboardTileTypes.LOOM].includes(tile.type);

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
        AnyType,
        AnyType
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
    getFilterRuleFromFieldWithDefaultValue(
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
        !isNil(value) ? [value] : null, // When `null`, don't set default value if no value is provided
    );

const getDefaultTileSqlTargets = (
    column: ResultColumn,
    availableTileColumns: Record<string, ResultColumn[] | undefined>,
) =>
    Object.entries(availableTileColumns).reduce<
        Record<string, DashboardFieldTarget>
    >((acc, [tileUuid, availableColumns]) => {
        if (!availableColumns) return acc;

        const filterableField = availableColumns.find(
            (target) => target.reference === column.reference,
        );
        if (!filterableField) return acc;

        return {
            ...acc,
            [tileUuid]: {
                fieldId: filterableField.reference,
                tableName: `sql_chart`,
                isSqlColumn: true,
                fallbackType: filterableField.type,
            },
        };
    }, {});

export const createDashboardFilterRuleFromSqlColumn = ({
    column,
    availableTileColumns,
    isTemporary,
    value,
}: {
    column: ResultColumn;
    availableTileColumns: Record<string, ResultColumn[]>;
    isTemporary: boolean;
    value?: unknown;
}): DashboardFilterRule =>
    getFilterRuleWithDefaultValue(
        getFilterTypeFromItemType(column.type),
        undefined,
        {
            id: uuidv4(),
            operator:
                value === null ? FilterOperator.NULL : FilterOperator.EQUALS,
            target: {
                fieldId: column.reference,
                tableName: 'sql_chart',
                isSqlColumn: true,
                fallbackType: column.type,
            },
            tileTargets: getDefaultTileSqlTargets(column, availableTileColumns),
            disabled: !isTemporary,
            label: undefined,
        },
        !isNil(value) ? [value] : null, // When `null`, don't set default value if no value is provided
    );

type AddFilterRuleArgs = {
    filters: Filters;
    field: FilterableField;
    value?: AnyType;
};

export const addFilterRule = ({
    filters,
    field,
    value,
}: AddFilterRuleArgs): Filters => {
    const groupKey = ((f: AnyType) => {
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
    value: AnyType,
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
    needsExplicitTileOverride: boolean = false, // If true, we don't apply the default tile targets to the filter rule'
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
                // If needs explicit override, we remove this filter
                if (needsExplicitTileOverride) {
                    return null;
                }
                return filter;
            }

            return {
                ...filter,
                target: tileConfig,
            };
        })
        .filter((f): f is DashboardFilterRule => f !== null);

export const getTabUuidsForFilterRules = (
    dashboardTiles: DashboardTile[] | undefined,
    filters: DashboardFilters,
    filterableFieldsByTileUuid:
        | Record<string, FilterableDimension[]>
        | undefined,
): Record<string, string[]> => {
    if (!dashboardTiles) return {};
    return dashboardTiles.reduce<Record<string, string[]>>((acc, tile) => {
        if (!tile.tabUuid || !isTileFilterable(tile)) {
            return acc;
        }

        const filterIdsForTile = getDashboardFilterRulesForTile(
            tile.uuid,
            filters.dimensions,
        )
            .filter((filterRule) => {
                const tileConfig = filterRule.tileTargets?.[tile.uuid];
                // TODO: Move this fallback logic to the getDashboardFilterRulesForTile function
                if (tileConfig === undefined && filterableFieldsByTileUuid) {
                    return filterableFieldsByTileUuid[tile.uuid]?.some(
                        (f) => getItemId(f) === filterRule.target.fieldId,
                    );
                }
                // Apply filter to tile
                return !!tileConfig;
            })
            .map((tileFilter) => tileFilter.id);

        // Set filter id as key and tile tab uuids as values
        filterIdsForTile.forEach((filterId) => {
            if (!acc[filterId]) {
                acc[filterId] = [];
            }
            if (tile.tabUuid && !acc[filterId].includes(tile.tabUuid)) {
                acc[filterId].push(tile.tabUuid);
            }
        });
        return acc;
    }, {});
};

export const getDashboardFilterRulesForTileAndReferences = (
    tileUuid: string,
    references: string[],
    rules: DashboardFilterRule[],
): DashboardFilterRule[] =>
    getDashboardFilterRulesForTile(tileUuid, rules, true).filter(
        (f) => f.target.isSqlColumn && references.includes(f.target.fieldId),
    );

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

/**
 * This function is used to override the chart filter with the dashboard filter
 * if the dashboard filter is a time or date dimension and the chart filter is a different granularity of the same dimension
 * or if the dashboard filter is the same dimension as the chart filter
 * Example:
 * Chart has a filter order_date_month; User applies Dashboard filter order_date_year
 * The chart filter will be overridden with the dashboard filter
 * set in the timeBasedOverrideMap so we know which metric filter to override
 * Another example:
 * Chart has a filter is_completed: true; User applies Dashboard filter is_completed: false
 * The chart filter will be overridden with the dashboard filter (is_completed: false)
 * @param item - The item to override
 * @param filterRulesList - The list of filter rules to check against
 * @param timeBasedOverrideMap - The map of overridden filters
 * @returns The overridden item
 */
const findAndOverrideChartFilter = (
    item: FilterGroupItem,
    filterRulesList: FilterRule[],
    timeBasedOverrideMap: TimeBasedOverrideMap | undefined,
): FilterGroupItem => {
    const identicalDashboardFilter = isFilterRule(item)
        ? filterRulesList.find((dashboardFilter) => {
              const overrideData = timeBasedOverrideMap?.[dashboardFilter.id];
              return (
                  overrideData?.fieldsToChange.includes(item.target.fieldId) ||
                  dashboardFilter.target.fieldId === item.target.fieldId
              );
          })
        : undefined;

    return identicalDashboardFilter
        ? {
              ...item,
              target: {
                  fieldId: identicalDashboardFilter.target.fieldId,
              },
              id: identicalDashboardFilter.id,
              values: identicalDashboardFilter.values,
              ...(identicalDashboardFilter.settings && {
                  settings: identicalDashboardFilter.settings,
              }),
              operator: identicalDashboardFilter.operator,
          }
        : item;
};

export const overrideChartFilter = (
    filterGroup: AndFilterGroup | OrFilterGroup,
    filterRules: FilterRule[],
    timeBasedOverrideMap: TimeBasedOverrideMap | undefined,
): FilterGroup =>
    isAndFilterGroup(filterGroup)
        ? {
              id: filterGroup.id,
              and: filterGroup.and.map((item) =>
                  findAndOverrideChartFilter(
                      item,
                      filterRules,
                      timeBasedOverrideMap,
                  ),
              ),
          }
        : {
              id: filterGroup.id,
              or: filterGroup.or.map((item) =>
                  findAndOverrideChartFilter(
                      item,
                      filterRules,
                      timeBasedOverrideMap,
                  ),
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

/**
 * Merges dashboard filters with existing filters using override tracking
 * @param filterGroup - Existing filter group to override
 * @param filterRules - Dashboard filter rules to apply
 * @param timeBasedOverrideMap - Dictionary tracking time-based field relationships
 * @returns New combined filter group with overrides applied
 */
export const overrideFilterGroupWithFilterRules = (
    filterGroup: FilterGroup | undefined,
    filterRules: FilterRule[],
    timeBasedOverrideMap: TimeBasedOverrideMap | undefined,
): FilterGroup => {
    if (!filterGroup) {
        return {
            id: uuidv4(),
            and: filterRules,
        };
    }

    const overriddenGroup = overrideChartFilter(
        filterGroup,
        filterRules,
        timeBasedOverrideMap,
    );

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
        // ...dashboardFilterRule.target,
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

const getFieldIdWithoutTable = (fieldId: string, tableName: string) =>
    fieldId.replace(`${tableName}_`, '');

/**
 * Tracks time-based metric filters that need overriding via external map
 * @param metricQueryDimensionFilters - Existing dimension filters in the query
 * @param dashboardFilterRule - Dashboard filter being applied
 * @param explore - Explore context for field relationships
 * @returns Filter rule with override data for external tracking
 */
export const trackWhichTimeBasedMetricFiltersToOverride = (
    metricQueryDimensionFilters: FilterGroup | undefined,
    dashboardFilterRule: DashboardFilterRule,
    explore?: Explore,
): {
    filter: DashboardFilterRule;
    overrideData?: {
        baseTimeDimensionName: string;
        fieldsToChange: string[];
    };
} => {
    if (!explore) return { filter: dashboardFilterRule };

    const baseDimension =
        explore.tables[dashboardFilterRule.target.tableName]?.dimensions[
            getFieldIdWithoutTable(
                dashboardFilterRule.target.fieldId,
                dashboardFilterRule.target.tableName,
            )
        ];

    if (!baseDimension?.timeIntervalBaseDimensionName) {
        return { filter: dashboardFilterRule };
    }

    const traverseFilterGroup = (
        filterGroup: FilterGroup | undefined,
    ): string[] => {
        if (!filterGroup) return [];

        return getItemsFromFilterGroup(filterGroup).reduce<string[]>(
            (acc, item) => {
                if (isFilterGroup(item)) {
                    return [...acc, ...traverseFilterGroup(item)];
                }

                if (isFilterRule(item)) {
                    const itemFieldId = getFieldIdWithoutTable(
                        item.target.fieldId,
                        dashboardFilterRule.target.tableName,
                    );
                    const itemDimension =
                        explore.tables[dashboardFilterRule.target.tableName]
                            ?.dimensions[itemFieldId];

                    const isTimeOrDateDimension =
                        itemDimension?.timeIntervalBaseDimensionName ===
                        baseDimension.timeIntervalBaseDimensionName;

                    if (isTimeOrDateDimension) {
                        return [...acc, item.target.fieldId];
                    }
                }

                return acc;
            },
            [],
        );
    };

    const fieldsToChange = traverseFilterGroup(metricQueryDimensionFilters);

    return fieldsToChange.length > 0
        ? {
              filter: dashboardFilterRule,
              overrideData: {
                  baseTimeDimensionName:
                      baseDimension.timeIntervalBaseDimensionName,
                  fieldsToChange,
              },
          }
        : { filter: dashboardFilterRule };
};

/**
 * Adds dashboard filters to a metric query while tracking time-based overrides
 * @param metricQuery - The original metric query
 * @param dashboardFilters - Dashboard filters to apply
 * @param explore - Explore context for field validation
 * @returns Enhanced metric query with merged filters and override map
 */
export const addDashboardFiltersToMetricQuery = (
    metricQuery: MetricQuery,
    dashboardFilters: DashboardFilters,
    explore?: Explore,
): MetricQuery => {
    const timeBasedOverrideMap: TimeBasedOverrideMap = {};

    const processedDimensionFilters = dashboardFilters.dimensions
        .map((filter) => {
            const result = trackWhichTimeBasedMetricFiltersToOverride(
                metricQuery.filters?.dimensions,
                filter,
                explore,
            );
            if (result.overrideData) {
                timeBasedOverrideMap[filter.id] = result.overrideData;
            }
            return result.filter;
        })
        .map(convertDashboardFilterRuleToFilterRule);

    return {
        ...metricQuery,
        filters: {
            dimensions: overrideFilterGroupWithFilterRules(
                metricQuery.filters?.dimensions,
                processedDimensionFilters,
                timeBasedOverrideMap,
            ),
            metrics: overrideFilterGroupWithFilterRules(
                metricQuery.filters?.metrics,
                dashboardFilters.metrics.map(
                    convertDashboardFilterRuleToFilterRule,
                ),
                undefined,
            ),
            tableCalculations: overrideFilterGroupWithFilterRules(
                metricQuery.filters?.tableCalculations,
                dashboardFilters.tableCalculations.map(
                    convertDashboardFilterRuleToFilterRule,
                ),
                undefined,
            ),
        },
    };
};

export const createFilterRuleFromModelRequiredFilterRule = (
    filter: ModelRequiredFilterRule,
    tableName: string,
): FilterRule => ({
    id: filter.id,
    target: {
        fieldId: convertFieldRefToFieldId(filter.target.fieldRef, tableName),
    },
    operator: filter.operator,
    values: filter.values,
    ...(filter.settings?.unitOfTime && {
        settings: {
            unitOfTime: filter.settings.unitOfTime,
        },
    }),
    required: filter.required === undefined ? true : filter.required,
});

export const isFilterRuleInQuery = (
    dimension: Dimension,
    filterRule: FilterRule,
    dimensionsFilterGroup: FilterGroup | undefined,
): undefined | boolean => {
    let dimensionFieldId = filterRule.target.fieldId;
    const timeDimension =
        dimension.isIntervalBase || dimension.timeInterval !== undefined;
    if (!dimension.isIntervalBase && dimension.timeInterval) {
        dimensionFieldId = dimensionFieldId.replace(
            `_${dimension.timeInterval.toLowerCase()}`,
            '',
        );
    }
    return (
        dimensionsFilterGroup &&
        isFilterRuleDefinedForFieldId(
            dimensionsFilterGroup,
            dimensionFieldId,
            timeDimension,
        )
    );
};

export const reduceRequiredDimensionFiltersToFilterRules = (
    requiredFilters: ModelRequiredFilterRule[],
    filters: FilterGroup | undefined,
    explore: Explore,
): FilterRule[] => {
    const table = explore.tables[explore.baseTable];

    return requiredFilters.reduce<FilterRule[]>((acc, filter): FilterRule[] => {
        let dimension: Dimension | undefined;
        // This function already takes care of falling back to the base table if the fieldRef doesn't have 2 parts (falls back to base table name)
        const filterRule = createFilterRuleFromModelRequiredFilterRule(
            filter,
            table.name,
        );

        if (isJoinModelRequiredFilter(filter)) {
            const joinedTable = explore.tables[filter.target.tableName];

            if (joinedTable) {
                dimension = Object.values(joinedTable.dimensions).find(
                    (d) => getItemId(d) === filterRule.target.fieldId,
                );
            }
        } else {
            dimension = Object.values(table.dimensions).find(
                (tc) => getItemId(tc) === filterRule.target.fieldId,
            );
        }

        if (dimension && !isFilterRuleInQuery(dimension, filterRule, filters)) {
            return [...acc, filterRule];
        }
        return acc;
    }, []);
};

export const resetRequiredFilterRules = (
    filterGroup: FilterGroup,
    requiredFiltersRef: string[],
): FilterGroup => {
    // Check if the input is a valid filter group
    if (!isFilterGroup(filterGroup)) return filterGroup;

    const filterGroupItems = isAndFilterGroup(filterGroup)
        ? filterGroup.and
        : filterGroup.or;

    // Iterate over each item in the filter group
    const updatedItems = filterGroupItems.map((filterGroupItem) => {
        // If the item is a filter rule, check if its id is not in the required filters reference
        if (
            isFilterRule(filterGroupItem) &&
            !requiredFiltersRef.includes(filterGroupItem.target.fieldId)
        ) {
            // Mark the filter rule as not required
            const newFilterRule: FilterGroupItem = {
                ...filterGroupItem,
                required: false,
            };
            return newFilterRule;
        }
        // If the item is a nested filter group, recursively call the function
        if (isFilterGroup(filterGroupItem)) {
            return resetRequiredFilterRules(
                filterGroupItem,
                requiredFiltersRef,
            );
        }

        return filterGroupItem;
    });

    return {
        ...filterGroup,
        [getFilterGroupItemsPropertyName(filterGroup)]: updatedItems,
    };
};
