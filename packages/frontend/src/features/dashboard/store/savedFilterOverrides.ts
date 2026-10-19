import {
    getDashboardDimensionOverrideMatches,
    type DashboardFilterRule,
    type DashboardFilterRuleOverride,
    type DashboardFilters,
} from '@lightdash/common';

export type SavedFilterOverrides = Record<
    keyof DashboardFilters,
    DashboardFilterRuleOverride[]
>;

export type SavedFilterOverrideCategory = 'dimensions' | 'metrics';

export const emptySavedFilterOverrides: SavedFilterOverrides = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

// Lock state and requirement flags are metadata of the saved dashboard, not
// something the URL should be able to assert. Strip them from URL-provided
// override rules so a stale shared link can't keep a filter "locked",
// required, or in a requirement group after an editor has changed the saved
// dashboard.
type UrlOverrideRule = DashboardFilterRuleOverride & {
    lockedTabUuids?: string[];
    required?: boolean;
    requiredGroupId?: string;
};

const sanitizeOverrideRule = (
    rule: UrlOverrideRule,
): DashboardFilterRuleOverride => {
    const { lockedTabUuids, required, requiredGroupId, ...rest } = rule;
    return rest;
};

const sanitizeOverrideState = (state: {
    dimensions?: UrlOverrideRule[];
    metrics?: UrlOverrideRule[];
    tableCalculations?: UrlOverrideRule[];
}): SavedFilterOverrides => ({
    dimensions: (state.dimensions ?? []).map(sanitizeOverrideRule),
    metrics: (state.metrics ?? []).map(sanitizeOverrideRule),
    tableCalculations: (state.tableCalculations ?? []).map(
        sanitizeOverrideRule,
    ),
});

/** Throws when the `filters` URL param is not valid JSON. */
export const parseSavedFilterOverridesParam = (
    param: string | null,
): SavedFilterOverrides => {
    if (!param) return emptySavedFilterOverrides;
    return sanitizeOverrideState(JSON.parse(param));
};

export const hasSavedFiltersOverrides = (
    overrides: DashboardFilters | undefined,
) =>
    !!(
        overrides &&
        (overrides.dimensions?.length > 0 || overrides.metrics?.length > 0)
    );

export const toSavedFilterOverride = ({
    tileTargets,
    lockedTabUuids,
    required,
    requiredGroupId,
    ...item
}: DashboardFilterRule): DashboardFilterRuleOverride => item;

export const addSavedFilterOverride = (
    overrides: SavedFilterOverrides,
    rule: DashboardFilterRule,
    category: SavedFilterOverrideCategory,
): SavedFilterOverrides => {
    const override = toSavedFilterOverride(rule);
    const existing = overrides[category];
    const updated = existing.some((item) => item.id === override.id)
        ? existing.map((item) => (item.id === override.id ? override : item))
        : [...existing, override];
    return { ...overrides, [category]: updated };
};

export const removeSavedFilterOverride = (
    overrides: SavedFilterOverrides,
    rule: DashboardFilterRule,
    category: SavedFilterOverrideCategory,
): SavedFilterOverrides => ({
    ...overrides,
    [category]: overrides[category].filter((item) => item.id !== rule.id),
});

export const resetSavedFilterOverrides = (
    overrides: SavedFilterOverrides,
): SavedFilterOverrides => ({ ...overrides, dimensions: [], metrics: [] });

export const reconcileSavedFilterOverrideIds = (
    overrides: SavedFilterOverrides,
    savedFilters: DashboardFilters,
): SavedFilterOverrides => {
    const matches = getDashboardDimensionOverrideMatches(
        savedFilters.dimensions,
        overrides.dimensions,
    );
    let dimensions = overrides.dimensions;

    matches.forEach(({ savedFilterIndex, overrideIndex }) => {
        const savedFilterId = savedFilters.dimensions[savedFilterIndex].id;
        if (overrides.dimensions[overrideIndex].id !== savedFilterId) {
            if (dimensions === overrides.dimensions) {
                dimensions = [...overrides.dimensions];
            }
            dimensions[overrideIndex] = {
                ...overrides.dimensions[overrideIndex],
                id: savedFilterId,
            };
        }
    });

    return dimensions === overrides.dimensions
        ? overrides
        : { ...overrides, dimensions };
};
