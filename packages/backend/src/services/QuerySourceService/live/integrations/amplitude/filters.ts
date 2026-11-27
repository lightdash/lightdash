import { FilterOperator } from '@lightdash/common';

export const AMPLITUDE_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

/** Segment filters on a property: Amplitude's `is` and `is not`. */
export const AMPLITUDE_PROPERTY_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

/** An event name, or the ordered steps of a funnel. */
export const AMPLITUDE_EVENT_FILTERS = [FilterOperator.EQUALS];

export const AMPLITUDE_NUMBER_FILTERS = [FilterOperator.EQUALS];
