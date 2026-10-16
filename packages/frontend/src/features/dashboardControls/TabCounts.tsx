import { Badge, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import { getTabCounts, getTabCountsForField, isSqlColumnRow } from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

export const TabCounts: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
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
            ? 'this filter'
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
                const isFieldActive = activeFieldId !== null;
                return createPortal(
                    <Tooltip
                        fz="xs"
                        label={`${count.applied} of ${count.total} ${count.total === 1 ? 'tile on this tab is' : 'tiles on this tab are'} filtered by ${subject}`}
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
                            {`${count.applied} of ${count.total}`}
                        </Badge>
                    </Tooltip>,
                    element,
                    tab.uuid,
                );
            })}
        </>
    );
};
