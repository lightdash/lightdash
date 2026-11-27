import { FilterOperator } from '@lightdash/common';

export const MIXPANEL_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

/** Property filters, written into Mixpanel's `where` expression. */
export const MIXPANEL_PROPERTY_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

/** An event name, or a saved funnel's id. */
export const MIXPANEL_EVENT_FILTERS = [FilterOperator.EQUALS];

export const MIXPANEL_NUMBER_FILTERS = [FilterOperator.EQUALS];
