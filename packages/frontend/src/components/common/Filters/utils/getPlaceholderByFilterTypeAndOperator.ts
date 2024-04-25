import {
    assertUnreachable,
    FilterOperator,
    FilterType,
} from '@lightdash/common';

export const getPlaceholderByFilterTypeAndOperator = ({
    type,
    operator,
    disabled,
}: {
    type: FilterType;
    operator: FilterOperator;
    disabled?: boolean;
}) => {
    if (disabled) return 'any value';

    switch (type) {
        case FilterType.NUMBER:
            switch (operator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return 'Enter value(s)';
                case FilterOperator.LESS_THAN:
                case FilterOperator.GREATER_THAN:
                    return 'Enter value';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                    return '';
                case FilterOperator.ENDS_WITH:
                case FilterOperator.STARTS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.IN_BETWEEN:
                    // This can happen if a filter was added using an old table calculation without type, as we default to number
                    console.warn(
                        `Unexpected operator ${type} for number filter type. If you are using a table calculation, please update its result type to string.`,
                    );
                    return '';
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        case FilterType.STRING:
            switch (operator) {
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
                    return '';
                case FilterOperator.LESS_THAN:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.IN_BETWEEN:
                    throw new Error('Not implemented');
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        case FilterType.DATE:
            switch (operator) {
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
                    return '#';
                case FilterOperator.IN_BETWEEN:
                    // in between is a special case since it displays two separate date pickers
                    // by default it shows a correct placeholder which is "Start date" and "End date"
                    return '';
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                    return '';
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                    throw new Error('Not implemented');
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        case FilterType.BOOLEAN:
            switch (operator) {
                case FilterOperator.EQUALS:
                    return 'False';
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                    return '';
                case FilterOperator.NOT_EQUALS:
                case FilterOperator.LESS_THAN:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.IN_BETWEEN:
                    throw new Error('Not implemented');
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        default:
            return assertUnreachable(type, 'unknown type');
    }
};
