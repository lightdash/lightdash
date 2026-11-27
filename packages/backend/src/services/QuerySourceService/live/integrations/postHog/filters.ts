import { DimensionType, FilterOperator } from '@lightdash/common';

export const POSTHOG_NULL_FILTERS = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const POSTHOG_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_BOOLEAN_FILTERS = [
    FilterOperator.EQUALS,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_FILTERS_BY_TYPE: Record<DimensionType, FilterOperator[]> =
    {
        [DimensionType.STRING]: POSTHOG_STRING_FILTERS,
        [DimensionType.NUMBER]: POSTHOG_NUMBER_FILTERS,
        [DimensionType.DATE]: POSTHOG_DATE_FILTERS,
        [DimensionType.TIMESTAMP]: POSTHOG_DATE_FILTERS,
        [DimensionType.BOOLEAN]: POSTHOG_BOOLEAN_FILTERS,
    };

export const POSTHOG_METRIC_FILTERS = POSTHOG_NUMBER_FILTERS.filter(
    (operator) => !POSTHOG_NULL_FILTERS.includes(operator),
);
