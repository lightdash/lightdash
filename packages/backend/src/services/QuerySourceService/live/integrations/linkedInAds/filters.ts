import { FilterOperator } from '@lightdash/common';

export const LINKEDIN_ADS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

// adAnalytics facets match whole IDs
export const LINKEDIN_ADS_ID_FILTERS = [FilterOperator.EQUALS];
