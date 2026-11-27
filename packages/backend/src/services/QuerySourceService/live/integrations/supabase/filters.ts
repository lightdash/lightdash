import { FilterOperator } from '@lightdash/common';

/** "is" and "is not" take several values: PostgREST's in.(…) and not.in.(…). */
export const SUPABASE_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const SUPABASE_SET_FILTERS = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const SUPABASE_RANGE_FILTERS = [
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const SUPABASE_TEXT_FILTERS = [
    ...SUPABASE_VALUE_FILTERS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_NUMBER_FILTERS = [
    ...SUPABASE_VALUE_FILTERS,
    ...SUPABASE_RANGE_FILTERS,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_BOOLEAN_FILTERS = [
    FilterOperator.EQUALS,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    ...SUPABASE_RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SUPABASE_SET_FILTERS,
];

/** A timestamp "is" a day only as a range, so timestamps take ranges. */
export const SUPABASE_TIMESTAMP_FILTERS = [
    ...SUPABASE_RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SUPABASE_SET_FILTERS,
];

/** JSON and arrays read as text; they can only be checked for being empty. */
export const SUPABASE_STRUCTURED_FILTERS = SUPABASE_SET_FILTERS;
