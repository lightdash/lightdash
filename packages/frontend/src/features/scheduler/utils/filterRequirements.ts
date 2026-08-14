import {
    applyDimensionOverrides,
    getUnmetFilterRequirements,
    isTileInSelectedTabs,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type UnmetFilterRequirement,
} from '@lightdash/common';
import { doesFilterApplyToTile } from '../../dashboardFilters/FilterConfiguration/utils';

export type SchedulerFilterRequirements = {
    unmetRequirements: UnmetFilterRequirement[];
    filtersWithUnmetRequirements: DashboardFilterRule[];
};

/** The dashboard tiles and the fields each one can be filtered on. */
export type SchedulerFilterableTiles = {
    tiles: DashboardTile[];
    tabUuids: string[];
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
};

/**
 * Which tiles a delivery renders, so requirements on tabs it leaves out don't
 * block it. `selectedTabs` is null for "all tabs".
 */
export type SchedulerTabScope = SchedulerFilterableTiles & {
    selectedTabs: string[] | null;
};

/**
 * Mirrors the dashboard's own tab scoping: a filter without `tileTargets`
 * applies everywhere, otherwise it must reach a tile in the delivery. Deciding
 * that needs each tile's filterable fields, so while those are missing nothing
 * is scoped out.
 */
const getAppliesToDelivery = (
    tabScope: SchedulerTabScope | undefined,
): ((filter: DashboardFilterRule) => boolean) => {
    if (!tabScope || tabScope.filterableFieldsByTileUuid === undefined) {
        return () => true;
    }

    const { tiles, tabUuids, selectedTabs, filterableFieldsByTileUuid } =
        tabScope;
    const includesEveryTab =
        selectedTabs === null ||
        (selectedTabs.length === tabUuids.length &&
            tabUuids.every((tabUuid) => selectedTabs.includes(tabUuid)));
    if (includesEveryTab) {
        return () => true;
    }

    return (filter) =>
        tiles.some(
            (tile) =>
                isTileInSelectedTabs(tile, selectedTabs) &&
                doesFilterApplyToTile(filter, tile, filterableFieldsByTileUuid),
        );
};

/**
 * Filter requirements that block a delivery. Evaluates what the delivery will
 * actually run with — the saved dashboard rules overlaid with the scheduler
 * overrides — so an unmet any-of group blocks like an unmet required filter,
 * and dropping a rule from the overrides can't skip the check.
 */
export const getSchedulerFilterRequirements = (
    savedDashboardFilters: DashboardFilters | undefined,
    schedulerFilters: DashboardFilterRule[] | undefined,
    tabScope?: SchedulerTabScope,
): SchedulerFilterRequirements => {
    if (!savedDashboardFilters) {
        return { unmetRequirements: [], filtersWithUnmetRequirements: [] };
    }

    const effectiveFilters: DashboardFilters = {
        ...savedDashboardFilters,
        dimensions: applyDimensionOverrides(
            savedDashboardFilters,
            schedulerFilters ?? [],
        ),
    };

    const appliesToDelivery = getAppliesToDelivery(tabScope);
    const scopedFilters: DashboardFilters = {
        ...effectiveFilters,
        dimensions: effectiveFilters.dimensions.filter(appliesToDelivery),
        metrics: effectiveFilters.metrics.filter(appliesToDelivery),
    };
    const unmetRequirements = getUnmetFilterRequirements(scopedFilters);
    const seenFilterIds = new Set<string>();
    const filtersWithUnmetRequirements = unmetRequirements
        .flatMap((requirement) =>
            requirement.type === 'single'
                ? [requirement.filter]
                : requirement.filters,
        )
        .filter((filter) => {
            if (seenFilterIds.has(filter.id)) return false;
            seenFilterIds.add(filter.id);
            return true;
        });

    return { unmetRequirements, filtersWithUnmetRequirements };
};
