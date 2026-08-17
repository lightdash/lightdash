import {
    getItemId,
    isDashboardFieldTarget,
    isDashboardFilterRule,
    type BaseFilterRule,
    type DashboardFilterableField,
} from '@lightdash/common';
import isEmpty from 'lodash/isEmpty';
import uniq from 'lodash/uniq';

export {
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterOperatorOptions,
    getFilterOptions,
} from '@lightdash/common';

export const getFilterRuleTables = (
    filterRule: BaseFilterRule,
    field: DashboardFilterableField,
    filterableFields: DashboardFilterableField[],
): string[] => {
    if (
        isDashboardFilterRule(filterRule) &&
        filterRule.tileTargets &&
        !isEmpty(filterRule.tileTargets)
    ) {
        return Object.values(filterRule.tileTargets).reduce<string[]>(
            (tables, tileTarget) => {
                const targetField = filterableFields.find(
                    (f) =>
                        tileTarget !== false &&
                        isDashboardFieldTarget(tileTarget) &&
                        f.table === tileTarget.tableName &&
                        getItemId(f) === tileTarget.fieldId,
                );
                return targetField
                    ? uniq([...tables, targetField.tableLabel])
                    : tables;
            },
            [],
        );
    } else {
        return [field.tableLabel];
    }
};

export const formatDisplayValue = (value: string): string => {
    return value
        .replace(/^\s+|\s+$/g, (match) => '␣'.repeat(match.length))
        .replace(/\n/g, '↵');
};
