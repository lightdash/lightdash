import {
    assertUnreachable,
    FilterOperator,
    type DashboardFilterRule,
} from '@lightdash/common';
import produce from 'immer';
import isEqual from 'lodash/isEqual';

export const hasFilterValueSet = (filterRule: DashboardFilterRule) => {
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
            return (
                filterRule.settings &&
                filterRule.settings.unitOfTime &&
                filterRule.values &&
                filterRule.values.length > 0
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return filterRule.settings && filterRule.settings.unitOfTime;
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

export const isFilterEnabled = (
    filterRule?: DashboardFilterRule,
    isEditMode?: boolean,
    isCreatingNew?: boolean,
) => {
    if (!filterRule) return false;

    const isFilterRuleDisabled = filterRule.disabled;
    if (
        (isFilterRuleDisabled && isEditMode) ||
        (isFilterRuleDisabled && !isCreatingNew)
    ) {
        return true;
    }

    return hasFilterValueSet(filterRule);
};

export const getFilterRuleRevertableObject = (
    filterRule: DashboardFilterRule,
) => {
    return {
        disabled: filterRule.disabled,
        values: filterRule.values,
        operator: filterRule.operator,
        settings: filterRule.settings,
        label: filterRule.label,
    };
};

export const hasSavedFilterValueChanged = (
    originalFilterRule: DashboardFilterRule,
    filterRule: DashboardFilterRule,
) => {
    if (originalFilterRule.disabled && filterRule.values === undefined) {
        return false;
    }

    // FIXME: remove this once we fix Date value serialization.
    // example: with date inputs we get a Date object originally but a string after we save the filter
    const serializedInternalFilterRule = produce(filterRule, (draft) => {
        if (draft.values && draft.values.length > 0) {
            draft.values = draft.values.map((v) =>
                v instanceof Date ? v.toISOString() : v,
            );
        }
    });

    return !isEqual(
        getFilterRuleRevertableObject(originalFilterRule),
        getFilterRuleRevertableObject(serializedInternalFilterRule),
    );
};
