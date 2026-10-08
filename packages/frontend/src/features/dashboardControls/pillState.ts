import { arrayMove } from '@dnd-kit/sortable';
import {
    DimensionType,
    getFilterTypeFromItemType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type UiStringKey,
    type UiStringResolver,
} from '@lightdash/common';
import {
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
} from '../../components/common/Filters/FilterInputs/utils';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    doesFilterApplyToAnyTile,
    getTabsForFilterRule,
} from '../dashboardFilters/FilterConfiguration/utils';

export type FilterPillGroup = 'dimensions' | 'metrics';

/** Moves a rule to another rule's place inside its group, as the shipped bar does. */
export const moveFilterRule = (
    filters: DashboardFilters,
    group: FilterPillGroup,
    activeId: string,
    overId: string,
): DashboardFilters => {
    const oldIndex = filters[group].findIndex((rule) => rule.id === activeId);
    const newIndex = filters[group].findIndex((rule) => rule.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return filters;
    }
    return {
        ...filters,
        [group]: arrayMove(filters[group], oldIndex, newIndex),
    };
};

type PlacementContext = {
    dashboardTiles: DashboardTile[] | undefined;
    sortedTabUuids: string[];
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    activeTabUuid: string | undefined;
};

export type FilterPillPlacement = {
    isOnActiveTab: boolean;
    /** No tab holds a tile of the filter; such a pill always shows. */
    isOnNoTab: boolean;
    isOrphaned: boolean;
    orphanedTooltipKey: UiStringKey;
};

// Mirrors getOrphanedState in the shipped ActiveFilters: tabs decide only
// when there is more than one, otherwise the tiles do
export const getFilterPillPlacement = (
    rule: DashboardFilterRule,
    {
        dashboardTiles,
        sortedTabUuids,
        filterableFieldsByTileUuid,
        activeTabUuid,
    }: PlacementContext,
): FilterPillPlacement => {
    const appliesToTabs = getTabsForFilterRule(
        rule,
        dashboardTiles,
        sortedTabUuids,
        filterableFieldsByTileUuid,
    );
    const isOnNoTab = appliesToTabs.length === 0;
    const isOnActiveTab =
        !activeTabUuid || appliesToTabs.includes(activeTabUuid);
    if (sortedTabUuids.length > 1) {
        return {
            isOnActiveTab,
            isOnNoTab,
            isOrphaned: isOnNoTab,
            orphanedTooltipKey: 'filters.notAppliedToAnyTabs',
        };
    }
    return {
        isOnActiveTab,
        isOnNoTab,
        isOrphaned: !doesFilterApplyToAnyTile(
            rule,
            dashboardTiles,
            filterableFieldsByTileUuid,
        ),
        orphanedTooltipKey: 'filters.notAppliedToAnyTiles',
    };
};

// The label rules of the shipped pill: the field, else the SQL column a tile
// reported, else the type the target carries
export const getFilterPillLabels = (
    rule: DashboardFilterRule,
    field: DashboardFilterableField | undefined,
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>,
    getUiString: UiStringResolver,
) => {
    if (field) {
        return getConditionalRuleLabelFromItem(rule, field, getUiString);
    }
    const column = Object.values(sqlChartTilesMetadata)
        .flatMap((metadata) => metadata.columns)
        .find(({ reference }) => reference === rule.target.fieldId);
    if (column) {
        return getConditionalRuleLabel(
            rule,
            getFilterTypeFromItemType(column.type),
            column.reference,
            getUiString,
        );
    }
    return getConditionalRuleLabel(
        rule,
        getFilterTypeFromItemType(
            rule.target.fallbackType ?? DimensionType.STRING,
        ),
        rule.target.fieldId,
        getUiString,
    );
};

// Dates carry units and booleans have their own labels, so both show the
// composed value instead of a list of raw values
export const showsComposedValue = (
    rule: DashboardFilterRule,
    field: DashboardFilterableField | undefined,
): boolean => {
    const type: string =
        field?.type ?? rule.target.fallbackType ?? DimensionType.STRING;
    return (
        type === DimensionType.DATE ||
        type === DimensionType.TIMESTAMP ||
        type === DimensionType.BOOLEAN
    );
};
