import {
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isFilterGroup,
    type DashboardFilters,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import dayjs from 'dayjs';

const convertFilterRule = <T extends FilterRule>(filterRule: T): T => {
    return {
        ...filterRule,
        values: filterRule.values?.map((value) => {
            if (value instanceof Date) {
                return dayjs(value).format('YYYY-MM-DDTHH:mm:ss') + 'Z';
            }
            return value;
        }),
    };
};
const convertFilterGroups = (filterGroup: FilterGroup): FilterGroup => {
    const items = getItemsFromFilterGroup(filterGroup);
    const convertedItems: FilterGroupItem[] = items.map((item) => {
        if (isFilterGroup(item)) return convertFilterGroups(item);
        else return convertFilterRule(item);
    });
    return {
        ...filterGroup,
        [getFilterGroupItemsPropertyName(filterGroup)]: convertedItems,
    };
};

export const convertDateFilters = (filters: Filters): Filters => {
    // Fix original date time values on filters instead of converting dates into UTC when using JSON.stringify on API request
    return {
        dimensions:
            filters.dimensions && convertFilterGroups(filters.dimensions),
        metrics: filters.metrics && convertFilterGroups(filters.metrics),
        tableCalculations:
            filters.tableCalculations &&
            convertFilterGroups(filters.tableCalculations),
    };
};

export const convertDateDashboardFilters = (
    filters: DashboardFilters,
): DashboardFilters => {
    // Fix original date time values on filters instead of converting dates into UTC when using JSON.stringify on API request
    return {
        dimensions: filters.dimensions.map(convertFilterRule),
        metrics: filters.metrics.map(convertFilterRule),
        tableCalculations: filters.tableCalculations.map(convertFilterRule),
    };
};
