import { interpolateUiString } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import { useEffect, useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import { getTabCounts, getTabCountsForField, isSqlColumnRow } from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';
import { useHoveredFilterRule } from './useHoveredFilterRule';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

export const TabCounts: FC = () => {
    const getUiString = useUiStrings();
    const editedRule = useControlsSidebarSelector((c) => c.editingRule);
    const isEditedPlaceholder = useControlsSidebarSelector(
        (c) => c.isPlaceholder,
    );
    const editedActiveFieldId = useControlsSidebarSelector(
        (c) => c.activeFieldId,
    );
    // A hovered rail row counts its own filter, as a whole, in blue
    const hoveredRule = useHoveredFilterRule();
    const isFilterHovered = hoveredRule !== null;
    const editingRule = hoveredRule ?? editedRule;
    const isPlaceholder = !isFilterHovered && isEditedPlaceholder;
    const activeFieldId = isFilterHovered ? null : editedActiveFieldId;
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // Dimensions and metrics: a filter can be on either
    const fieldsMap = useFilterableItemsMap();
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // A placeholder reaches no tile, so "0 of N" would only mislead
    const isEnabled =
        editingRule !== null && !isPlaceholder && dashboardTabs.length > 0;
    const targets = usePortalTargets(
        tabUuids,
        getTabSelector,
        isEnabled,
        false,
    );

    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const activeTabElement =
        activeTabUuid === undefined ? undefined : targets[activeTabUuid];
    // The badges widen the tabs past a narrow screen: keep the one in view seen
    useEffect(() => {
        activeTabElement?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
        });
    }, [activeTabElement]);

    const counts = useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (editingRule === null) return {};
        return activeFieldId === null
            ? getTabCounts(
                  editingRule,
                  tiles,
                  dashboardTabs,
                  fieldsByTile,
                  sqlColumnsByTile,
              )
            : getTabCountsForField(
                  editingRule,
                  activeFieldId,
                  tiles,
                  dashboardTabs,
                  fieldsByTile,
                  sqlColumnsByTile,
              );
    }, [
        editingRule,
        activeFieldId,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
    ]);

    if (!isEnabled) return null;

    // A SQL column goes by its own name, never by a field's
    const subject =
        activeFieldId === null
            ? getUiString('filters.rail.thisFilter')
            : isSqlColumnRow(editingRule, activeFieldId)
              ? activeFieldId
              : (toDashboardFilterableField(fieldsMap[activeFieldId])?.label ??
                activeFieldId);

    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                const count = counts[tab.uuid];
                if (!element || !count || count.total === 0) return null;
                // Tabs the control, or the active field, reaches stand out
                const isReached = count.applied > 0;
                const isFieldActive = activeFieldId !== null || isFilterHovered;
                return createPortal(
                    <Tooltip
                        fz="xs"
                        label={interpolateUiString(
                            getUiString(
                                count.total === 1
                                    ? 'filters.rail.tabCountTooltip.singular'
                                    : 'filters.rail.tabCountTooltip.plural',
                            ),
                            {
                                applied: count.applied,
                                total: count.total,
                                subject,
                            },
                        )}
                    >
                        <Badge
                            size="xs"
                            // A tab it reaches is filled, blue for the active field
                            variant={isReached ? 'light' : 'transparent'}
                            color={isReached && isFieldActive ? 'blue' : 'gray'}
                            data-reached={isReached}
                            data-field-active={isFieldActive}
                            className={classes.count}
                        >
                            {interpolateUiString(
                                getUiString('filters.rail.countOf'),
                                {
                                    applied: count.applied,
                                    total: count.total,
                                },
                            )}
                        </Badge>
                    </Tooltip>,
                    element,
                    tab.uuid,
                );
            })}
        </>
    );
};
