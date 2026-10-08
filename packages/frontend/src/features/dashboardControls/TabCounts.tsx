import { Badge, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import {
    getControlTabCounts,
    getControlTabCountsForKey,
    getParameterLabel,
} from './parameterControls';
import { getTabCounts, getTabCountsForField } from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebar } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

export const TabCounts: FC = () => {
    const { editingRule, editingControl, isPlaceholder, activeFieldId } =
        useControlsSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // A placeholder reaches no tile, so "0 of N" would only mislead
    const isEnabled =
        ((editingRule !== null && !isPlaceholder) || editingControl !== null) &&
        dashboardTabs.length > 0;
    const targets = usePortalTargets(tabUuids, getTabSelector, isEnabled);

    const counts = useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (editingControl !== null) {
            return activeFieldId === null
                ? getControlTabCounts(
                      editingControl,
                      tiles,
                      dashboardTabs,
                      tileParameterReferences,
                  )
                : getControlTabCountsForKey(
                      editingControl,
                      activeFieldId,
                      tiles,
                      dashboardTabs,
                      tileParameterReferences,
                  );
        }
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
        editingControl,
        activeFieldId,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
        tileParameterReferences,
    ]);

    const getFilterSubject = (): string => {
        if (activeFieldId === null) return 'this filter';
        const activeField = fieldsMap[activeFieldId];
        return activeField
            ? getFieldDisplayLabel(activeField, Object.values(fieldsMap))
            : activeFieldId;
    };
    const getControlSubject = (): string =>
        activeFieldId === null
            ? 'this control'
            : getParameterLabel(activeFieldId, parameterDefinitions);
    const reach =
        editingControl !== null
            ? `are set by ${getControlSubject()}`
            : `use ${getFilterSubject()}`;

    if (!isEnabled) return null;

    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                const count = counts[tab.uuid];
                if (!element || !count || count.total === 0) return null;
                return createPortal(
                    <Tooltip
                        fz="xs"
                        label={`${count.applied} of ${count.total} tiles on this tab ${reach}`}
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
