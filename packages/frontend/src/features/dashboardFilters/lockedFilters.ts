import {
    getItemId,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type UnmetFilterRequirement,
} from '@lightdash/common';

export type DashboardFilterFieldAvailability = {
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    hiddenFilterableFieldIds: ReadonlySet<string>;
};

/**
 * A saved rule on a field with `hidden: true` that no tile offers in its
 * pickers. The server still applies it, so the UI shows it read-only. Rules on
 * fields that no longer exist are not locked; they stay invalid.
 */
export const isLockedDashboardFilterRule = (
    filterRule: DashboardFilterRule,
    {
        filterableFieldsByTileUuid,
        hiddenFilterableFieldIds,
    }: DashboardFilterFieldAvailability,
): boolean => {
    if (!filterableFieldsByTileUuid || filterRule.target.isSqlColumn) {
        return false;
    }
    const fieldIds = new Set([
        filterRule.target.fieldId,
        ...Object.values(filterRule.tileTargets ?? {}).flatMap((target) =>
            target ? [target.fieldId] : [],
        ),
    ]);
    const isOfferedByATile = Object.values(filterableFieldsByTileUuid).some(
        (fields) => fields.some((field) => fieldIds.has(getItemId(field))),
    );
    return (
        !isOfferedByATile &&
        [...fieldIds].some((fieldId) => hiddenFilterableFieldIds.has(fieldId))
    );
};

/** Viewers cannot set a locked filter, so a requirement made only of locked filters never blocks */
export const excludeLockedFilterRequirements = (
    requirements: UnmetFilterRequirement[],
    isLocked: (filterRule: DashboardFilterRule) => boolean,
): UnmetFilterRequirement[] =>
    requirements.filter((requirement) =>
        requirement.type === 'single'
            ? !isLocked(requirement.filter)
            : !requirement.filters.every(isLocked),
    );
