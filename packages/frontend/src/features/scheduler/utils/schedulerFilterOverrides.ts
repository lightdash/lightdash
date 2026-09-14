import {
    FilterOperator,
    getFilterRulesFromGroup,
    isWithValueFilter,
    type DashboardTileTargets,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { hasSavedFilterValueChanged } from '../../dashboardFilters/FilterConfiguration/utils';

/** A saved dashboard rule or chart rule a delivery can override. */
export type SchedulerOverridableRule = FilterRule & {
    label?: string;
    tileTargets?: DashboardTileTargets;
};

export const isValidFilterOperator = (
    value: unknown,
): value is FilterOperator =>
    Object.values(FilterOperator).includes(value as FilterOperator);

export const hasSchedulerFilterChanged = (
    filterToCompareAgainst: SchedulerOverridableRule,
    updatedFilter: SchedulerOverridableRule,
) =>
    // Check if the filter has changed, ignoring disabled state.
    // The inputs this component uses do not include enabling/disabling filters.
    hasSavedFilterValueChanged(
        { ...filterToCompareAgainst, disabled: undefined },
        { ...updatedFilter, disabled: undefined },
    );

/**
 * The inputs cannot enable or disable a rule, so a value filter with no values
 * is stored disabled and reads as "is any value".
 */
export const withDerivedDisabledState = <R extends SchedulerOverridableRule>(
    rule: R,
): R => ({
    ...rule,
    disabled:
        isWithValueFilter(rule.operator) &&
        (rule.values?.length === 0 || rule.values?.length === undefined),
});

export const CHART_FILTER_SECTIONS = [
    'dimensions',
    'metrics',
    'tableCalculations',
] as const;
export type ChartFilterSection = (typeof CHART_FILTER_SECTIONS)[number];

export const getChartFilterSectionRules = (
    filters: Filters | undefined,
    section: ChartFilterSection,
): FilterRule[] => getFilterRulesFromGroup(filters?.[section]);

const toAndGroup = (rules: FilterRule[], id: string): FilterGroup | undefined =>
    rules.length > 0 ? { id, and: rules } : undefined;

/**
 * The delivery's starting point: every saved rule, flattened to one AND group
 * per section. The backend re-homes each override onto the saved rule by id,
 * so the chart's own nesting is preserved at delivery time.
 */
export const getChartFilterOverridesSeed = (chartFilters: Filters): Filters =>
    CHART_FILTER_SECTIONS.reduce<Filters>((acc, section) => {
        const group = toAndGroup(
            getChartFilterSectionRules(chartFilters, section),
            uuidv4(),
        );
        return group ? { ...acc, [section]: group } : acc;
    }, {});

/** Replaces one section's rules; an emptied section is dropped. */
export const setChartFilterSectionRules = (
    draft: Filters | undefined,
    section: ChartFilterSection,
    rules: FilterRule[],
): Filters => {
    const next: Filters = { ...draft };
    const group = toAndGroup(rules, draft?.[section]?.id ?? uuidv4());
    if (group) {
        next[section] = group;
    } else {
        delete next[section];
    }
    return next;
};

/** Mirrors the dashboard tab: only a real value change touches the draft. */
export const updateChartFilterSectionRules = (
    updatedFilter: FilterRule,
    originalFilter: FilterRule,
    draftRules: FilterRule[],
): FilterRule[] | undefined => {
    const filterIndex = draftRules.findIndex((f) => f.id === updatedFilter.id);
    const isExistingFilter = filterIndex !== -1;
    const filterToCompareAgainst = isExistingFilter
        ? draftRules[filterIndex]
        : originalFilter;

    if (!hasSavedFilterValueChanged(filterToCompareAgainst, updatedFilter)) {
        return undefined;
    }
    const nextFilter = withDerivedDisabledState(updatedFilter);
    return isExistingFilter
        ? draftRules.map((f) => (f.id === updatedFilter.id ? nextFilter : f))
        : [...draftRules, nextFilter];
};
