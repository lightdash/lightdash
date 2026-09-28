import {
    getItemId,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type UnmetFilterRequirement,
} from '@lightdash/common';

/**
 * A saved rule whose field no tile offers in its pickers, e.g. a field with
 * `hidden: true`. The server still applies it, so the UI shows it read-only.
 * SQL column rules resolve against tile columns instead and are never locked.
 */
export const isLockedDashboardFilterRule = (
    filterRule: DashboardFilterRule,
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
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
    return !Object.values(filterableFieldsByTileUuid).some((fields) =>
        fields.some((field) => fieldIds.has(getItemId(field))),
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
