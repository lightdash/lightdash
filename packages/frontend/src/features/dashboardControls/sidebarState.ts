import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

export type ControlsSidebarSnapshot = {
    dashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
};

// A control with no mapping yet is a placeholder; it is never saved
export const PLACEHOLDER_TARGET = { fieldId: '', tableName: '' };
export const isPlaceholderRule = (rule: DashboardFilterRule): boolean =>
    rule.target.fieldId === '';

export const findFilterRule = (
    filters: DashboardFilters,
    filterId: string,
): DashboardFilterRule | null =>
    filters.dimensions.find((rule) => rule.id === filterId) ??
    filters.metrics.find((rule) => rule.id === filterId) ??
    null;

export const replaceFilterRule = (
    filters: DashboardFilters,
    next: DashboardFilterRule,
): DashboardFilters => ({
    ...filters,
    dimensions: filters.dimensions.map((rule) =>
        rule.id === next.id ? next : rule,
    ),
    metrics: filters.metrics.map((rule) => (rule.id === next.id ? next : rule)),
});

export const removeFilterRule = (
    filters: DashboardFilters,
    filterId: string,
): DashboardFilters => ({
    ...filters,
    dimensions: filters.dimensions.filter((rule) => rule.id !== filterId),
    metrics: filters.metrics.filter((rule) => rule.id !== filterId),
});

export const isFilterRuleDirty = (
    snapshot: DashboardFilters,
    current: DashboardFilters,
    filterId: string,
): boolean =>
    !isEqual(
        findFilterRule(snapshot, filterId),
        findFilterRule(current, filterId),
    );

// Locks or unlocks the filter on one tab; lockKey is the tab uuid, or the
// dashboard uuid when the dashboard has no tabs
// A control with no field cannot be kept; a label is optional
export const canKeepFilterRule = (rule: DashboardFilterRule): boolean =>
    !isPlaceholderRule(rule);
