import { FilterOperator, FilterType } from '@lightdash/common';

export const getPlaceholderByFilterTypeAndOperator = (
    filterType: FilterType,
    filterOperator: FilterOperator,
) => {
    switch (filterType) {
        case FilterType.NUMBER:
            switch (filterOperator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return 'Enter value(s)';
                case FilterOperator.LESS_THAN:
                case FilterOperator.GREATER_THAN:
                    return 'Enter value';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                default:
                    return '';
            }
        case FilterType.STRING:
            switch (filterOperator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return 'Start typing to filter results';
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                    return 'Enter value(s)';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                default:
                    return '';
            }
        case FilterType.DATE:
            switch (filterOperator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                case FilterOperator.LESS_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return 'Select a date';
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                case FilterOperator.IN_THE_CURRENT:
                    return 'Select a time period';
                case FilterOperator.IN_BETWEEN:
                    return 'Start date End date';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                default:
                    return '';
            }
        case FilterType.BOOLEAN:
            switch (filterOperator) {
                case FilterOperator.EQUALS:
                    return 'True or False';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                default:
                    return '';
            }
        default:
            return '';
    }
};
