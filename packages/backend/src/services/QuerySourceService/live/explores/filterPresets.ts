import { FilterOperator } from '@lightdash/common';

const DATE_RANGE = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

/**
 * Filter operator lists many APIs share. Use one when a field takes exactly
 * these operators in this order; otherwise write the field's own list.
 */
export const LIVE_FILTERS: Record<
    | 'equals'
    | 'isOrIsNot'
    | 'nullChecks'
    | 'contains'
    | 'text'
    | 'numberCompare'
    | 'dateRange'
    | 'dateRangeOrFrom'
    | 'dateRangeOpen',
    FilterOperator[]
> = {
    /** Exact match only. */
    equals: [FilterOperator.EQUALS],
    /** `is` and `is not`. */
    isOrIsNot: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
    /** Empty or not. */
    nullChecks: [FilterOperator.NULL, FilterOperator.NOT_NULL],
    /** Contains or doesn't. */
    contains: [FilterOperator.INCLUDE, FilterOperator.NOT_INCLUDE],
    /** Is, is not, contains, doesn't contain, starts with, ends with. */
    text: [
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.INCLUDE,
        FilterOperator.NOT_INCLUDE,
        FilterOperator.STARTS_WITH,
        FilterOperator.ENDS_WITH,
    ],
    /** Is, is not, every comparison and between. */
    numberCompare: [
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.GREATER_THAN,
        FilterOperator.GREATER_THAN_OR_EQUAL,
        FilterOperator.LESS_THAN,
        FilterOperator.LESS_THAN_OR_EQUAL,
        FilterOperator.IN_BETWEEN,
    ],
    /** A closed date range: in the past, in the current, between, on. */
    dateRange: DATE_RANGE,
    /** A date range, or from a day on. */
    dateRangeOrFrom: [
        ...DATE_RANGE,
        FilterOperator.GREATER_THAN,
        FilterOperator.GREATER_THAN_OR_EQUAL,
    ],
    /** A date range open at either end; the API fills the missing side. */
    dateRangeOpen: [
        ...DATE_RANGE,
        FilterOperator.GREATER_THAN,
        FilterOperator.GREATER_THAN_OR_EQUAL,
        FilterOperator.LESS_THAN,
        FilterOperator.LESS_THAN_OR_EQUAL,
    ],
};
