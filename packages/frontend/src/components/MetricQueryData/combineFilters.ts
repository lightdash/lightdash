import {
    FilterOperator,
    getFieldsFromMetricQuery,
    getItemsFromFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    normalizeCellRawForFilter,
    type DashboardFilters,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type MetricQuery,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

type CombineFiltersArgs = {
    fieldValues: Record<string, ResultValue>;
    metricQuery: MetricQuery;
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
    explore?: Explore;
    timezone?: string;
};

const isEmptyGroup = (item: FilterGroupItem): boolean =>
    isFilterGroup(item) && getItemsFromFilterGroup(item).length === 0;

// Spread `and` groups into the combined `and`; keep `or` groups wrapped to preserve logic
const getSourceGroupItems = (group: FilterGroup): FilterGroupItem[] => {
    const items = isAndFilterGroup(group) ? group.and : [group];
    return items.filter((item) => !isEmptyGroup(item));
};

export const combineFilters = ({
    fieldValues,
    metricQuery,
    pivotReference,
    dashboardFilters,
    extraFilters,
    explore,
    timezone,
}: CombineFiltersArgs): Filters => {
    const combinedDimensionFilters: Array<FilterGroupItem> = [];
    const combinedMetricFilters: Array<FilterGroupItem> = [];

    if (metricQuery.filters.dimensions) {
        combinedDimensionFilters.push(
            ...getSourceGroupItems(metricQuery.filters.dimensions),
        );
    }
    if (metricQuery.filters.metrics) {
        combinedMetricFilters.push(
            ...getSourceGroupItems(metricQuery.filters.metrics),
        );
    }
    if (dashboardFilters) {
        combinedDimensionFilters.push(...dashboardFilters.dimensions);
        if (dashboardFilters.metrics?.length) {
            combinedMetricFilters.push(...dashboardFilters.metrics);
        }
    }
    if (pivotReference?.pivotValues) {
        const pivotFilter: FilterRule[] = pivotReference.pivotValues.map(
            (pivot) => ({
                id: uuidv4(),
                target: {
                    fieldId: pivot.field,
                },
                operator: FilterOperator.EQUALS,
                values: [pivot.value],
            }),
        );
        combinedDimensionFilters.push(...pivotFilter);
    }
    if (extraFilters?.dimensions) {
        combinedDimensionFilters.push(
            ...getSourceGroupItems(extraFilters.dimensions),
        );
    }
    if (extraFilters?.metrics) {
        combinedMetricFilters.push(
            ...getSourceGroupItems(extraFilters.metrics),
        );
    }

    const itemsMap = explore
        ? getFieldsFromMetricQuery(metricQuery, explore)
        : undefined;

    const dimensionFilters: FilterRule[] = metricQuery.dimensions.reduce<
        FilterRule[]
    >((acc, dimension) => {
        const rowValue = fieldValues[dimension];
        if (!rowValue) {
            return acc;
        }
        const dimensionFilter: FilterRule = {
            id: uuidv4(),
            target: {
                fieldId: dimension,
            },
            operator:
                rowValue.raw === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values:
                rowValue.raw === null
                    ? undefined
                    : [
                          normalizeCellRawForFilter(
                              rowValue.raw,
                              itemsMap?.[dimension],
                              timezone,
                          ),
                      ],
        };
        return [...acc, dimensionFilter];
    }, []);
    combinedDimensionFilters.push(...dimensionFilters);

    return {
        dimensions: {
            id: uuidv4(),
            and: combinedDimensionFilters,
        },
        ...(combinedMetricFilters.length > 0 && {
            metrics: {
                id: uuidv4(),
                and: combinedMetricFilters,
            },
        }),
    };
};
