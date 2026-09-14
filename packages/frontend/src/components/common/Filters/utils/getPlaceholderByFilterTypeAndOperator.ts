import {
    assertUnreachable,
    DEFAULT_UI_STRINGS,
    FilterOperator,
    FilterType,
    NotImplementedError,
    type UiStringKey,
    type UiStringResolver,
} from '@lightdash/common';

export const getPlaceholderByFilterTypeAndOperator = ({
    type,
    operator,
    disabled,
    singleValue,
    getUiString,
}: {
    type: FilterType;
    operator: FilterOperator;
    disabled?: boolean;
    singleValue?: boolean;
    getUiString?: UiStringResolver;
}) => {
    const resolve = (key: UiStringKey) =>
        getUiString ? getUiString(key) : DEFAULT_UI_STRINGS[key];
    if (disabled) return resolve('filters.placeholders.anyValue');

    switch (type) {
        case FilterType.NUMBER:
            switch (operator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return singleValue
                        ? resolve('filters.placeholders.enterValue')
                        : resolve('filters.placeholders.enterValues');
                case FilterOperator.LESS_THAN:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return resolve('filters.placeholders.enterValues');
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                    return '';
                case FilterOperator.IN_BETWEEN:
                case FilterOperator.NOT_IN_BETWEEN:
                    // in between is a special case since it displays two separate number inputs
                    // by default it shows a correct placeholder which is "Min value" and "Max value"
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
                case FilterOperator.NOT_IN_THE_CURRENT:
                case FilterOperator.IN_PERIOD_TO_DATE:
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
                    return resolve('filters.placeholders.startTyping');
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                    return resolve('filters.placeholders.enterValues');
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                    return singleValue
                        ? resolve('filters.placeholders.enterValue')
                        : resolve('filters.placeholders.enterValues');
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
                case FilterOperator.NOT_IN_THE_CURRENT:
                case FilterOperator.IN_BETWEEN:
                case FilterOperator.NOT_IN_BETWEEN:
                case FilterOperator.IN_PERIOD_TO_DATE:
                    throw new NotImplementedError(
                        `Filter type ${type} with operator ${operator} is not implemented`,
                    );
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        case FilterType.DATE:
            switch (operator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return singleValue
                        ? resolve('filters.placeholders.selectDate')
                        : resolve('filters.placeholders.selectDates');
                case FilterOperator.LESS_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return resolve('filters.placeholders.selectDate');
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                    return '#';
                case FilterOperator.IN_BETWEEN:
                    // in between is a special case since it displays two separate date pickers
                    // by default it shows a correct placeholder which is "Start date" and "End date"
                    return '';
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.NOT_IN_THE_CURRENT:
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                case FilterOperator.IN_PERIOD_TO_DATE:
                    return '';
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.NOT_IN_BETWEEN:
                    throw new NotImplementedError(
                        `Filter type ${type} with operator ${operator} is not implemented`,
                    );
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        case FilterType.BOOLEAN:
            switch (operator) {
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                    return resolve('filters.placeholders.selectValue');
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                    return '';
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
                case FilterOperator.NOT_IN_THE_CURRENT:
                case FilterOperator.IN_BETWEEN:
                case FilterOperator.NOT_IN_BETWEEN:
                case FilterOperator.IN_PERIOD_TO_DATE:
                    throw new NotImplementedError(
                        `Filter type ${type} with operator ${operator} is not implemented`,
                    );
                default:
                    return assertUnreachable(operator, 'unknown operator');
            }
        default:
            return assertUnreachable(type, 'unknown type');
    }
};
