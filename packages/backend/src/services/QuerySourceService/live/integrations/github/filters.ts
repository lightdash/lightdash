import { FilterOperator } from '@lightdash/common';

// Search matches whole words, so only word matches are offered
export const GITHUB_TEXT_FILTERS = [
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const GITHUB_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

// A state is one qualifier; "not merged" has no single one
export const GITHUB_STATE_FILTERS = [FilterOperator.EQUALS];

export const GITHUB_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.LESS_THAN,
];

export const GITHUB_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const GITHUB_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or GitHub's first day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];
