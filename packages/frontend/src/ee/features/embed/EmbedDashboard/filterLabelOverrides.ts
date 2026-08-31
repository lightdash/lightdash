import {
    getFilterLabelTranslation,
    translateFilterRuleLabels,
    type DashboardAsCodeLanguageMap,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';

export type DashboardFilterLabelOverrides =
    DashboardAsCodeLanguageMap['dashboard'][string]['filters'];

type FilterKind = keyof DashboardFilters;

export const applyFilterLabelOverrides = (
    filters: DashboardFilters,
    overrides: DashboardFilterLabelOverrides,
): DashboardFilters => {
    const labels = overrides?.labels;
    if (!labels) return filters;

    return {
        dimensions: translateFilterRuleLabels(filters.dimensions, labels),
        metrics: translateFilterRuleLabels(filters.metrics, labels),
        tableCalculations: translateFilterRuleLabels(
            filters.tableCalculations,
            labels,
        ),
    };
};

// Saving an embedded dashboard persists the provider's filter state, which has
// translated labels applied. Rules still showing the translation of their
// saved label get that saved label back; anything else (editor renames, rules
// added in the embed) is kept as-is.
export const restoreFilterLabelOverrides = (
    filters: DashboardFilters,
    savedFilters: DashboardFilters,
    overrides: DashboardFilterLabelOverrides,
): DashboardFilters => {
    const labels = overrides?.labels;
    if (!labels) return filters;

    const restoreKind = (kind: FilterKind): DashboardFilterRule[] => {
        const savedLabelByRuleId = new Map(
            savedFilters[kind].map((rule) => [rule.id, rule.label]),
        );

        return filters[kind].map((rule) => {
            const savedLabel = savedLabelByRuleId.get(rule.id);
            const appliedLabel = getFilterLabelTranslation(labels, savedLabel);
            if (!appliedLabel || rule.label !== appliedLabel) {
                return rule;
            }
            return { ...rule, label: savedLabel };
        });
    };

    return {
        dimensions: restoreKind('dimensions'),
        metrics: restoreKind('metrics'),
        tableCalculations: restoreKind('tableCalculations'),
    };
};
