import {
    assertUnreachable,
    DashboardFilterRule,
    FilterOperator,
} from '@lightdash/common';
import produce from 'immer';
import isEqual from 'lodash-es/isEqual';
import pick from 'lodash-es/pick';

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

export const DASHBOARD_FILTER_REVERTABLE_FIELDS = [
    'label',
    'values',
    'operator',
    'settings',
];

export const isFilterConfigurationRevertButtonEnabled = (
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
        pick(originalFilterRule, DASHBOARD_FILTER_REVERTABLE_FIELDS),
        pick(serializedInternalFilterRule, DASHBOARD_FILTER_REVERTABLE_FIELDS),
    );
};
