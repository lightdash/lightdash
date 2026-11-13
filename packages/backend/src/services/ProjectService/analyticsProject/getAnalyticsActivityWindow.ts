import {
    FilterOperator,
    isAndFilterGroup,
    isFilterRule,
    type AnalyticsActivityWindow,
    type MetricQuery,
} from '@lightdash/common';

const isUtcDay = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(value);
    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
};

export const getAnalyticsActivityWindow = (
    query: MetricQuery,
    timezone: string | undefined,
): AnalyticsActivityWindow | undefined => {
    const filters = query.filters.dimensions;
    if (
        query.exploreName !== 'user_activity' ||
        timezone !== 'UTC' ||
        !filters ||
        !isAndFilterGroup(filters) ||
        query.customDimensions?.length ||
        query.additionalMetrics?.length ||
        query.tableCalculations.length
    )
        return undefined;

    // Only literal UTC day bounds present in the main AND group constrain every row.
    let start: string | undefined;
    let end: string | undefined;
    filters.and.forEach((filter) => {
        if (
            !isFilterRule(filter) ||
            filter.disabled ||
            filter.target.fieldId !== 'user_activity_activity_date_day' ||
            filter.settings ||
            filter.values?.length !== 1
        )
            return;
        const [day] = filter.values;
        if (!isUtcDay(day)) return;
        if (
            filter.operator === FilterOperator.GREATER_THAN_OR_EQUAL &&
            (!start || day > start)
        )
            start = day;
        if (filter.operator === FilterOperator.LESS_THAN && (!end || day < end))
            end = day;
    });
    return start && end && start < end ? { start, end } : undefined;
};
