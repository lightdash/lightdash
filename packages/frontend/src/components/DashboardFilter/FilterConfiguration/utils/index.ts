import {
    assertUnreachable,
    DashboardFilterRule,
    FilterOperator,
} from '@lightdash/common';

export const isFilterConfigurationApplyButtonEnabled = (
    filterRule: DashboardFilterRule,
) => {
    const isFilterRuleDisabled = filterRule.disabled;
    if (isFilterRuleDisabled) {
        return true;
    }

    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return true;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.LESS_THAN:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return filterRule.values && filterRule.values.length > 0;
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
        case FilterOperator.IN_THE_CURRENT:
            return filterRule.settings;
        case FilterOperator.IN_BETWEEN:
            return (
                filterRule.values &&
                filterRule.values.length === 2 &&
                filterRule.values.every(Boolean)
            );
        default:
            return assertUnreachable(filterRule.operator, 'unknown operator');
    }
};
