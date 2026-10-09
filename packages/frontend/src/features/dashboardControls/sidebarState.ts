import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';

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

// Undoes one rule: back to what the snapshot holds, or out when it was not in
// it. Every other rule keeps what was written since
export const restoreFilterRule = (
    filters: DashboardFilters,
    snapshot: DashboardFilters,
    filterId: string,
): DashboardFilters => {
    const saved = findFilterRule(snapshot, filterId);
    return saved === null
        ? removeFilterRule(filters, filterId)
        : replaceFilterRule(filters, saved);
};

// What the dashboard's "changed" flag is once one rule was undone or removed
export const haveFiltersChangedSince = (
    snapshot: ControlsSidebarSnapshot,
    filters: DashboardFilters,
): boolean =>
    snapshot.haveFiltersChanged || !isEqual(snapshot.dashboardFilters, filters);

// An emptied label leaves the key as it was found, so the rule equals what it
// was: a saved rule comes from JSON, which has no undefined, so it has no key
export const withFilterRuleLabel = (
    rule: DashboardFilterRule,
    text: string,
    hadLabelKey: boolean,
): DashboardFilterRule => {
    const label = text.trim();
    if (label !== '') return { ...rule, label };
    return hadLabelKey
        ? { ...rule, label: undefined }
        : (omit(rule, 'label') as DashboardFilterRule);
};

/** A default that is switched on but has no value the shipped form accepts. */
export const isDefaultValueIncomplete = (rule: DashboardFilterRule) =>
    !rule.disabled && !hasFilterValueSet(rule);

// A control with no field cannot be kept; a label is optional
export const canKeepFilterRule = (rule: DashboardFilterRule): boolean =>
    !isPlaceholderRule(rule);
