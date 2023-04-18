import {
    FilterGroup,
    FilterGroupItem,
    FilterRule,
    Filters,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    isFilterGroup,
    MetricQuery,
} from '@lightdash/common';
import moment from 'moment';

export const convertDateFilters = (filters: Filters): Filters => {
    // Fix original date time values on filters instead of converting dates into UTC when using JSON.stringify on API request
    const convertFilterRule = (filterRule: FilterRule): FilterRule => {
        return {
            ...filterRule,
            values: filterRule.values?.map((value) => {
                if (value instanceof Date) {
                    return moment(value).format('YYYY-MM-DDTHH:mm:ss') + 'Z';
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
    return {
        dimensions:
            filters.dimensions && convertFilterGroups(filters.dimensions),
        metrics: filters.metrics && convertFilterGroups(filters.metrics),
    };
};
