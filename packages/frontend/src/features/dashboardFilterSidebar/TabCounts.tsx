import { Badge, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getTabCounts } from './peers';
import classes from './TabCounts.module.css';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

export const TabCounts: FC = () => {
    const { editingRule } = useFilterSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    const isEnabled = editingRule !== null && dashboardTabs.length > 0;
    const targets = usePortalTargets(tabUuids, getTabSelector, isEnabled);

    const counts = useMemo(
        () =>
            editingRule === null
                ? {}
                : getTabCounts(
                      editingRule,
                      dashboardTiles ?? [],
                      dashboardTabs,
                      fieldsByTile,
                  ),
        [editingRule, dashboardTiles, dashboardTabs, fieldsByTile],
    );

    if (!isEnabled) return null;

    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                const count = counts[tab.uuid];
                if (!element || !count) return null;
                return createPortal(
                    <Tooltip
                        fz="xs"
                        label={`${count.applied} of ${count.total} charts on this tab use this filter`}
                    >
                        <Badge
                            size="xs"
                            variant="light"
                            color="gray"
                            className={classes.count}
                        >
                            {count.applied} of {count.total}
                        </Badge>
                    </Tooltip>,
                    element,
                    tab.uuid,
                );
            })}
        </>
    );
};
