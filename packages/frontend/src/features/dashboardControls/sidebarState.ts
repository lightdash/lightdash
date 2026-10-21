import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import isUndefined from 'lodash/isUndefined';
import omit from 'lodash/omit';
import omitBy from 'lodash/omitBy';
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

// A rule as it would save, with the tile entries that equal the default dropped
type ToSavedRule = (rule: DashboardFilterRule) => DashboardFilterRule;

// Keys holding undefined (JSON drops them) and `required: false` read as
// absent; locks are read as a set, so their order is not kept. Empty tile
// targets stay: tabs read them differently from no tile targets
const toComparableRule = (rule: DashboardFilterRule, toSaved: ToSavedRule) => {
    const { required, lockedTabUuids, ...rest } = toSaved(rule);
    return omitBy(
        {
            ...rest,
            required: required || undefined,
            lockedTabUuids: lockedTabUuids && [...lockedTabUuids].sort(),
        },
        isUndefined,
    );
};

const isSameRule = (
    a: DashboardFilterRule | null,
    b: DashboardFilterRule | null,
    toSaved: ToSavedRule,
): boolean => {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return isEqual(toComparableRule(a, toSaved), toComparableRule(b, toSaved));
};

const isSameFilters = (
    a: DashboardFilters,
    b: DashboardFilters,
    toSaved: ToSavedRule,
): boolean =>
    (['dimensions', 'metrics', 'tableCalculations'] as const).every(
        (group) =>
            a[group].length === b[group].length &&
            a[group].every((rule, index) =>
                isSameRule(rule, b[group][index], toSaved),
            ),
    );

export const isFilterRuleDirty = (
    snapshot: DashboardFilters,
    current: DashboardFilters,
    filterId: string,
    toSaved: ToSavedRule,
): boolean =>
    !isSameRule(
        findFilterRule(snapshot, filterId),
        findFilterRule(current, filterId),
        toSaved,
    );

// The other rules the editor wrote to that Discard can put back: in the
// snapshot and still there
export const haveOtherFilterRulesChanged = (
    snapshot: DashboardFilters,
    current: DashboardFilters,
    filterIds: string[],
    toSaved: ToSavedRule,
): boolean =>
    filterIds.some((filterId) => {
        const saved = findFilterRule(snapshot, filterId);
        const now = findFilterRule(current, filterId);
        return (
            saved !== null && now !== null && !isSameRule(saved, now, toSaved)
        );
    });

// Puts a rule of the snapshot back in the list the snapshot holds it in: in
// place when it is still there, else out of any other list and at its index
const putBackFilterRule = (
    filters: DashboardFilters,
    snapshot: DashboardFilters,
    saved: DashboardFilterRule,
): DashboardFilters => {
    const group = snapshot.metrics.includes(saved) ? 'metrics' : 'dimensions';
    if (filters[group].some((rule) => rule.id === saved.id))
        return replaceFilterRule(filters, saved);
    const others = removeFilterRule(filters, saved.id);
    const index = snapshot[group].indexOf(saved);
    return {
        ...others,
        [group]: [
            ...others[group].slice(0, index),
            saved,
            ...others[group].slice(index),
        ],
    };
};

// Undoes one rule: back to what the snapshot holds, or out when the snapshot
// does not hold it. Every other rule keeps what was written since
export const restoreFilterRule = (
    filters: DashboardFilters,
    snapshot: DashboardFilters,
    filterId: string,
): DashboardFilters => {
    const saved = findFilterRule(snapshot, filterId);
    return saved === null
        ? removeFilterRule(filters, filterId)
        : putBackFilterRule(filters, snapshot, saved);
};

// Undoes the editor's writes to other rules. A rule that is not in the
// snapshot, or that is gone, is left as it is
export const restoreFilterRules = (
    filters: DashboardFilters,
    snapshot: DashboardFilters,
    filterIds: string[],
): DashboardFilters =>
    filterIds
        .map((filterId) => findFilterRule(snapshot, filterId))
        .filter((saved): saved is DashboardFilterRule => saved !== null)
        .filter((saved) => findFilterRule(filters, saved.id) !== null)
        .reduce(
            (next, saved) => putBackFilterRule(next, snapshot, saved),
            filters,
        );

// What the dashboard's "changed" flag is once the editor is done
export const haveFiltersChangedSince = (
    snapshot: ControlsSidebarSnapshot,
    filters: DashboardFilters,
    toSaved: ToSavedRule,
): boolean =>
    snapshot.haveFiltersChanged ||
    !isSameFilters(snapshot.dashboardFilters, filters, toSaved);

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
