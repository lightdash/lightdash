import {
    isFilterLockedOnTab,
    isWithValueFilter,
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
export const toggleFilterLockOnTab = (
    rule: DashboardFilterRule,
    lockKey: string,
    hasTabs: boolean,
): DashboardFilterRule => {
    const existing = rule.lockedTabUuids ?? [];
    const next = isFilterLockedOnTab(rule, lockKey, hasTabs)
        ? existing.filter((uuid) => uuid !== lockKey)
        : [...existing, lockKey];
    return { ...rule, lockedTabUuids: next.length > 0 ? next : undefined };
};

/** An enabled rule whose operator needs a value but has none. */
export const isDefaultValueIncomplete = (rule: DashboardFilterRule) =>
    !rule.disabled &&
    isWithValueFilter(rule.operator) &&
    (rule.values ?? []).length === 0;

// A control with no field, or a new one with no label, cannot be kept
export const canKeepFilterRule = (
    rule: DashboardFilterRule,
    isNew: boolean,
): boolean =>
    !isPlaceholderRule(rule) && (!isNew || (rule.label ?? '').trim() !== '');
