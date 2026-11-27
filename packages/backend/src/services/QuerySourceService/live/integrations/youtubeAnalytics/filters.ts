import { FilterOperator } from '@lightdash/common';

export const YOUTUBE_ANALYTICS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

// reports.query filters match whole values only
export const YOUTUBE_ANALYTICS_EXACT_FILTERS = [FilterOperator.EQUALS];
