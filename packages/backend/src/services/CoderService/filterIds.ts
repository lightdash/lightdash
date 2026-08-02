import {
    type FilterGroup,
    type FilterGroupInput,
    type FilterGroupItem,
    type FilterGroupItemInput,
    type FilterRule,
    type Filters,
    type FiltersInput,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

const normalizeFilterGroupItem = (
    item: FilterGroupItemInput,
): FilterGroupItem => {
    if ('or' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            or: item.or.map(normalizeFilterGroupItem),
        };
    }
    if ('and' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            and: item.and.map(normalizeFilterGroupItem),
        };
    }
    return { ...(item as FilterRule), id: item.id ?? uuidv4() };
};

const normalizeFilterGroup = (
    group: FilterGroupInput | undefined,
): FilterGroup | undefined => {
    if (!group) return undefined;
    return normalizeFilterGroupItem(group) as FilterGroup;
};

export const normalizeFilterIds = (filters: FiltersInput): Filters => ({
    dimensions: normalizeFilterGroup(filters.dimensions),
    metrics: normalizeFilterGroup(filters.metrics),
    tableCalculations: normalizeFilterGroup(filters.tableCalculations),
});

const stripFilterGroupItemIds = (
    item: FilterGroupItemInput,
): FilterGroupItemInput => {
    if ('or' in item) return { or: item.or.map(stripFilterGroupItemIds) };
    if ('and' in item) return { and: item.and.map(stripFilterGroupItemIds) };
    const { id, ...filterRule } = item;
    return filterRule;
};

export const stripFilterIds = (
    filters: FiltersInput | undefined,
): FiltersInput | null => {
    if (!filters) return null;
    const result: FiltersInput = {};
    if (filters.dimensions) {
        result.dimensions = stripFilterGroupItemIds(
            filters.dimensions,
        ) as FilterGroupInput;
    }
    if (filters.metrics) {
        result.metrics = stripFilterGroupItemIds(
            filters.metrics,
        ) as FilterGroupInput;
    }
    if (filters.tableCalculations) {
        result.tableCalculations = stripFilterGroupItemIds(
            filters.tableCalculations,
        ) as FilterGroupInput;
    }
    return result;
};
