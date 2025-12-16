import {
    FilterOperator,
    assertUnreachable,
    getItemId,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { produce } from 'immer';
import isEqual from 'lodash/isEqual';

/**
 * Describes the relationship between a filter and a tile based on tileTargets configuration.
 *
 * - 'all': No tileTargets configuration exists, filter applies to all tiles
 * - 'excluded': Tile is explicitly excluded (tileConfig === false)
 * - 'explicit': Tile is explicitly included with field mapping (tileConfig is a field target)
 * - 'default': Tile should apply by default behavior (tileConfig is undefined)
 */
export type FilterTileRelation = 'all' | 'excluded' | 'explicit' | 'default';

/**
 * Gets the relationship between a filter and a tile based on tileTargets configuration.
 *
 * @param filterRule - The filter rule to check
 * @param tileUuid - The tile UUID to check
 * @returns The relationship type and the tileConfig if it exists
 */
export const getFilterTileRelation = (
    filterRule: DashboardFilterRule,
    tileUuid: string,
): {
    relation: FilterTileRelation;
    tileConfig: DashboardFieldTarget | false | undefined;
} => {
    if (!filterRule.tileTargets) {
        return { relation: 'all', tileConfig: undefined };
    }

    const tileConfig = filterRule.tileTargets[tileUuid];

    if (tileConfig === false) {
        return { relation: 'excluded', tileConfig };
    }

    if (tileConfig && isDashboardFieldTarget(tileConfig)) {
        return { relation: 'explicit', tileConfig };
    }

    return { relation: 'default', tileConfig: undefined };
};

/**
 * Checks if a tile has the filter's target field available.
 */
const tileHasFilterField = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, FilterableDimension[]>
        | undefined,
): boolean => {
    if (!filterableFieldsByTileUuid) return false;
    const tileFields = filterableFieldsByTileUuid[tile.uuid];
    return (
        tileFields?.some(
            (field) => getItemId(field) === filterRule.target.fieldId,
        ) ?? false
    );
};

/**
 * Determines if a filter applies to a specific tile based on tileTargets configuration.
 *
 * tileTargets[uuid] can be:
 * - undefined (not in object): applies by default IF tile has the filter's field
 * - false: explicitly excluded
 * - config object: explicitly included with field mapping
 *
 * @returns true if the filter applies to the tile
 */
export const doesFilterApplyToTile = (
    filterRule: DashboardFilterRule,
    tile: DashboardTile,
    filterableFieldsByTileUuid:
        | Record<string, FilterableDimension[]>
        | undefined,
): boolean => {
    const { relation } = getFilterTileRelation(filterRule, tile.uuid);

    switch (relation) {
        case 'all':
            // No tileTargets config - filter applies to all tiles that have the field
            return tileHasFilterField(
                filterRule,
                tile,
                filterableFieldsByTileUuid,
            );
        case 'excluded':
            return false;
        case 'explicit':
            return true;
        case 'default':
            // Not in tileTargets (undefined) - check if filter can apply by default
            return tileHasFilterField(
                filterRule,
                tile,
                filterableFieldsByTileUuid,
            );
        default:
            return assertUnreachable(
                relation,
                `Unknown filter tile relation: ${relation}`,
            );
    }
};

/**
 * Computes which tab UUIDs a filter applies to based on its tileTargets configuration.
 *
 * A filter applies to a tab if:
 * - The tab has at least one tile that supports the filter's field
 * - The tile is not explicitly excluded via tileTargets
 *
 * @param filterRule - The filter rule to check
 * @param dashboardTiles - All tiles in the dashboard
 * @param sortedTabUuids - Tab UUIDs in display order
 * @param filterableFieldsByTileUuid - Map of tile UUID to available filterable fields
 * @returns Array of tab UUIDs where the filter applies to at least one tile
 */
export const getTabsForFilterRule = (
    filterRule: DashboardFilterRule,
    dashboardTiles: DashboardTile[] | undefined,
    sortedTabUuids: string[],
    filterableFieldsByTileUuid:
        | Record<string, FilterableDimension[]>
        | undefined,
): string[] => {
    // Find which tabs have tiles targeted by this filter
    const tabsWithTargetedTiles = new Set<string>();
    dashboardTiles?.forEach((tile) => {
        if (!tile.tabUuid) return;

        if (
            doesFilterApplyToTile(filterRule, tile, filterableFieldsByTileUuid)
        ) {
            tabsWithTargetedTiles.add(tile.tabUuid);
        }
    });

    return sortedTabUuids.filter((tabUuid) =>
        tabsWithTargetedTiles.has(tabUuid),
    );
};

export const hasFilterValueSet = (filterRule: DashboardFilterRule) => {
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return true;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.LESS_THAN:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return filterRule.values && filterRule.values.length > 0;
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return (
                filterRule.settings &&
                filterRule.settings.unitOfTime &&
                filterRule.values &&
                filterRule.values.length > 0
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return filterRule.settings && filterRule.settings.unitOfTime;
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return (
                filterRule.values &&
                filterRule.values.length === 2 &&
                filterRule.values.every((val) => val != null && val !== '')
            );
        default:
            return assertUnreachable(filterRule.operator, 'unknown operator');
    }
};

export const isFilterEnabled = (
    filterRule?: DashboardFilterRule,
    isEditMode?: boolean,
    isCreatingNew?: boolean,
) => {
    if (!filterRule) return false;

    const isFilterRuleDisabled = filterRule.disabled;
    if (
        (isFilterRuleDisabled && isEditMode) ||
        (isFilterRuleDisabled && !isCreatingNew)
    ) {
        return true;
    }

    return hasFilterValueSet(filterRule);
};

export const getFilterRuleRevertableObject = (
    filterRule: DashboardFilterRule,
) => {
    return {
        disabled: filterRule.disabled,
        values: filterRule.values,
        operator: filterRule.operator,
        settings: filterRule.settings,
        label: filterRule.label,
    };
};

export const hasSavedFilterValueChanged = (
    originalFilterRule: DashboardFilterRule,
    filterRule: DashboardFilterRule,
) => {
    if (originalFilterRule.disabled && filterRule.values === undefined) {
        return false;
    }

    // FIXME: remove this once we fix Date value serialization.
    // example: with date inputs we get a Date object originally but a string after we save the filter
    const serializedInternalFilterRule = produce(filterRule, (draft) => {
        if (draft.values && draft.values.length > 0) {
            draft.values = draft.values.map((v) =>
                v instanceof Date ? v.toISOString() : v,
            );
        }
    });

    return !isEqual(
        getFilterRuleRevertableObject(originalFilterRule),
        getFilterRuleRevertableObject(serializedInternalFilterRule),
    );
};
