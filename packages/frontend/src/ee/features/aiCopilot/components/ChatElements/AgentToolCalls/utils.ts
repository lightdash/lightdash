import {
    friendlyName,
    getFilterRulesFromGroup,
    getFilterTypeFromItemType,
} from '@lightdash/common';
import { getConditionalRuleLabel } from '../../../../../../components/common/Filters/FilterInputs/utils';

// Helper function to get field name without table prefix
export const getFieldDisplayName = (fieldId: string) => {
    const friendlyFieldName = friendlyName(fieldId);
    // Remove table prefix (e.g., "Payments unique payment" -> "unique payment")
    const parts = friendlyFieldName.split(' ');
    if (parts.length > 1) {
        return parts.slice(1).join(' ');
    }
    return friendlyFieldName;
};

// Helper function to get filter descriptions
export const getFilterDescriptions = (filters: any): string[] => {
    const filterDescriptions: string[] = [];

    if (filters.dimensions) {
        const dimensionRules = getFilterRulesFromGroup(filters.dimensions);
        dimensionRules.forEach((rule) => {
            if (rule.target?.type) {
                const filterType = getFilterTypeFromItemType(rule.target.type);
                const fieldName = getFieldDisplayName(rule.target.fieldId);
                const ruleLabel = getConditionalRuleLabel(
                    rule,
                    filterType,
                    fieldName,
                );
                filterDescriptions.push(
                    `${ruleLabel.field} ${ruleLabel.operator}${
                        ruleLabel.value ? ` ${ruleLabel.value}` : ''
                    }`,
                );
            }
        });
    }

    if (filters.metrics) {
        const metricRules = getFilterRulesFromGroup(filters.metrics);
        metricRules.forEach((rule) => {
            if (rule.target?.type) {
                const filterType = getFilterTypeFromItemType(rule.target.type);
                const fieldName = getFieldDisplayName(rule.target.fieldId);
                const ruleLabel = getConditionalRuleLabel(
                    rule,
                    filterType,
                    fieldName,
                );
                filterDescriptions.push(
                    `${ruleLabel.field} ${ruleLabel.operator}${
                        ruleLabel.value ? ` ${ruleLabel.value}` : ''
                    }`,
                );
            }
        });
    }

    return filterDescriptions;
};
