import {
    getItemMap,
    isAndFilterGroup,
    isDimension,
    isFilterGroup,
    isMetric,
    type Explore,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type ItemsMap,
    type MetricQuery,
    type TimeFrames,
} from '@lightdash/common';
import {
    TimeGranularity,
    type MetricFlowOrderBy,
} from '../../../api/MetricFlowAPI';

const TIME_FRAME_TO_GRANULARITY: Partial<Record<TimeFrames, TimeGranularity>> =
    {
        DAY: TimeGranularity.DAY,
        WEEK: TimeGranularity.WEEK,
        MONTH: TimeGranularity.MONTH,
        QUARTER: TimeGranularity.QUARTER,
        YEAR: TimeGranularity.YEAR,
    };

const mapFilterRuleTarget = (
    rule: FilterRule,
    itemsMap: ItemsMap,
): FilterRule => {
    const field = itemsMap[rule.target.fieldId];
    if (!field || !isDimension(field)) return rule;
    return {
        ...rule,
        target: {
            ...rule.target,
            fieldId: field.name,
        },
    };
};

const mapFilterGroup = (
    group: FilterGroup,
    itemsMap: ItemsMap,
): FilterGroup => {
    const items: FilterGroupItem[] = isAndFilterGroup(group)
        ? group.and
        : group.or;
    const mappedItems = items.map((item) =>
        isFilterGroup(item)
            ? mapFilterGroup(item, itemsMap)
            : mapFilterRuleTarget(item, itemsMap),
    );
    return isAndFilterGroup(group)
        ? { ...group, and: mappedItems }
        : { ...group, or: mappedItems };
};

const mapFilters = (
    filters: Filters | undefined,
    itemsMap: ItemsMap,
): Filters | undefined => {
    if (!filters?.dimensions) return undefined;
    return {
        dimensions: mapFilterGroup(filters.dimensions, itemsMap),
    };
};

export const convertMetricQueryToMetricFlowQuery = (
    metricQuery: MetricQuery,
    exploreOrItemsMap: Explore | ItemsMap,
) => {
    const itemsMap =
        'tables' in exploreOrItemsMap
            ? getItemMap(exploreOrItemsMap)
            : exploreOrItemsMap;

    const metrics = metricQuery.metrics.reduce<Record<string, {}>>(
        (acc, fieldId) => {
            const field = itemsMap[fieldId];
            if (field && isMetric(field)) {
                acc[field.name] = {};
            }
            return acc;
        },
        {},
    );

    const dimensions = metricQuery.dimensions.reduce<
        Record<string, { grain?: TimeGranularity }>
    >((acc, fieldId) => {
        const field = itemsMap[fieldId];
        if (!field || !isDimension(field)) return acc;

        if (field.timeIntervalBaseDimensionName && field.timeInterval) {
            const grain = TIME_FRAME_TO_GRANULARITY[field.timeInterval];
            acc[field.timeIntervalBaseDimensionName] = grain ? { grain } : {};
        } else {
            acc[field.name] = {};
        }

        return acc;
    }, {});

    const orderBy = metricQuery.sorts.reduce<MetricFlowOrderBy[]>(
        (acc, sort) => {
            const field = itemsMap[sort.fieldId];
            if (!field) return acc;
            if (isMetric(field)) {
                acc.push({
                    type: 'metric',
                    name: field.name,
                    descending: sort.descending,
                });
            } else if (isDimension(field)) {
                if (field.timeIntervalBaseDimensionName && field.timeInterval) {
                    const grain = TIME_FRAME_TO_GRANULARITY[field.timeInterval];
                    acc.push({
                        type: 'groupBy',
                        name: field.timeIntervalBaseDimensionName,
                        grain,
                        descending: sort.descending,
                    });
                } else {
                    acc.push({
                        type: 'groupBy',
                        name: field.name,
                        descending: sort.descending,
                    });
                }
            }
            return acc;
        },
        [],
    );

    return {
        metrics,
        dimensions,
        filters: mapFilters(metricQuery.filters, itemsMap),
        orderBy,
    };
};
