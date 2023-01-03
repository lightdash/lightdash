import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import {
    Dimension,
    DimensionType,
    Field,
    fieldId,
    FilterableDimension,
    FilterableField,
    isDimension,
    isFilterableDimension,
    MetricType,
} from '../types/field';
import {
    DashboardFieldTarget,
    DashboardFilterRule,
    DateFilterRule,
    FilterGroup,
    FilterGroupItem,
    FilterOperator,
    FilterRule,
    Filters,
    FilterType,
    isAndFilterGroup,
    isFilterGroup,
    UnitOfTime,
} from '../types/filter';
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
];

export const countTotalFilterRules = (filters: Filters): number =>
    getTotalFilterRules(filters).length;

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

export const getFilterTypeFromField = (field: FilterableField): FilterType => {
    const fieldType = field.type;
    switch (field.type) {
        case DimensionType.STRING:
        case MetricType.STRING:
            return FilterType.STRING;
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
            return FilterType.NUMBER;
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
            return FilterType.DATE;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return FilterType.BOOLEAN;
        default: {
            return assertUnreachable(
                field,
                `No filter type found for field type: ${fieldType}`,
            );
        }
    }
};

export const getFilterRuleWithDefaultValue = <T extends FilterRule>(
    field: FilterableField,
    filterRule: T,
    values?: any[],
): T => {
    const filterType = getFilterTypeFromField(field);
    const filterRuleDefaults: Partial<FilterRule> = {};

    if (
        ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
            filterRule.operator,
        )
    ) {
        switch (filterType) {
            case FilterType.DATE: {
                const value = values ? values[0] : undefined;

                const isTimestamp = field.type === DimensionType.TIMESTAMP;
                if (filterRule.operator === FilterOperator.IN_THE_PAST) {
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

                    const timestampValue = valueIsDate
                        ? moment(value).format('YYYY-MM-DDTHH:mm:ssZ')
                        : moment().utc(true).format('YYYY-MM-DDTHH:mm:ssZ');

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
                        ? formatDate(value, undefined, false)
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

export const matchFieldExact = (a: FilterableField) => (b: FilterableField) =>
    a.type === b.type && a.name === b.name && a.table === b.table;

export const matchFieldByTypeAndName =
    (a: FilterableField) => (b: FilterableField) =>
        a.type === b.type && a.name === b.name;

export const matchFieldByType = (a: FilterableField) => (b: FilterableField) =>
    a.type === b.type;

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

export const createDashboardFilterRuleFromField = (
    field: FilterableField,
    availableTileFilters: Record<string, FilterableField[] | undefined>,
): DashboardFilterRule =>
    getFilterRuleWithDefaultValue(field, {
        id: uuidv4(),
        operator: FilterOperator.EQUALS,
        target: {
            fieldId: fieldId(field),
            tableName: field.table,
        },
        tileTargets: getDefaultTileTargets(field, availableTileFilters),
        label: undefined,
    });

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
    const groupKey = isDimension(field) ? 'dimensions' : 'metrics';
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
): {
    dimensions: FilterRule[];
    metrics: FilterRule[];
} =>
    filterRules.reduce<{
        dimensions: FilterRule[];
        metrics: FilterRule[];
    }>(
        (sum, filterRule) => {
            const fieldInRule = fields.find(
                (field) => fieldId(field) === filterRule.target.fieldId,
            );
            if (fieldInRule) {
                if (isDimension(fieldInRule)) {
                    return {
                        ...sum,
                        dimensions: [...sum.dimensions, filterRule],
                    };
                }
                return {
                    ...sum,
                    metrics: [...sum.metrics, filterRule],
                };
            }

            return sum;
        },
        {
            dimensions: [],
            metrics: [],
        },
    );
