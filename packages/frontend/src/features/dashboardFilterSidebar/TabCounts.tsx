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
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

export const TabCounts: FC = () => {
    const { editingRule, activeFieldId, parameterControls, editingControlId } =
        useFilterSidebar();
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
    const control =
        editingRule === null
            ? (parameterControls.find((c) => c.id === editingControlId) ?? null)
            : null;

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    const isEnabled =
        (editingRule !== null || control !== null) && dashboardTabs.length > 0;
    const targets = usePortalTargets(tabUuids, getTabSelector, isEnabled);

    const counts = useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (control !== null) {
            return activeFieldId !== null &&
                control.parameterKeys.includes(activeFieldId)
                ? getControlTabCountsForKey(
                      control,
                      activeFieldId,
                      tiles,
                      dashboardTabs,
                      tileParameterReferences,
                  )
                : getControlTabCounts(
                      control,
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
        activeFieldId,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
        control,
        tileParameterReferences,
    ]);

    const activeField =
        activeFieldId === null ? null : (fieldsMap[activeFieldId] ?? null);
    const subject = control
        ? activeFieldId !== null &&
          control.parameterKeys.includes(activeFieldId)
            ? getParameterLabel(activeFieldId, parameterDefinitions)
            : 'this control'
        : activeFieldId === null
          ? 'this filter'
          : activeField
            ? getFieldDisplayLabel(activeField, Object.values(fieldsMap))
            : activeFieldId;
    const verb = control ? 'are set by' : 'use';

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
                        label={`${count.applied} of ${count.total} charts on this tab ${verb} ${subject}`}
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
