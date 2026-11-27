import { FilterOperator } from '@lightdash/common';

export const SEARCH_CONSOLE_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    // Matched with includingRegex
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    // Search Console never reports empty values, so this always holds
    FilterOperator.NOT_NULL,
];

export const SEARCH_CONSOLE_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or the earliest retained day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];
