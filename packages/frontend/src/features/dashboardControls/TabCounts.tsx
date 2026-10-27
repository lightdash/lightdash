import { interpolateUiString } from '@lightdash/common';
import { Text, Tooltip, VisuallyHidden } from '@mantine/core';
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
import {
    getTabCounts,
    getTabCountsForField,
    getTilesOnTab,
    isSqlColumnRow,
} from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;

// Horizontal only: the page, an embed's container and its host keep their scroll
const scrollTabIntoList = (tab: Element) => {
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    const tabBox = tab.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    if (tabBox.left < listBox.left) {
        list.scrollLeft -= listBox.left - tabBox.left;
    } else if (tabBox.right > listBox.right) {
        list.scrollLeft += Math.min(
            tabBox.right - listBox.right,
            tabBox.left - listBox.left,
        );
    }
};

export const TabCounts: FC = () => {
    const getUiString = useUiStrings();
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const activeFieldId = useControlsSidebarSelector((c) => c.activeFieldId);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const rule = editingRule;
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // Dimensions and metrics: a filter can be on either
    const fieldsMap = useFilterableItemsMap();
    const sqlColumnsByTile = useSqlColumnsByTile(rule);

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // An editor's tabs keep the slots at rest, so opening a filter reflows none;
    // a viewer's get them once a field is picked
    const isEnabled =
        dashboardTabs.length > 0 &&
        (!isViewer || (rule !== null && !isPlaceholder));
    const targets = usePortalTargets(
        tabUuids,
        getTabSelector,
        isEnabled,
        false,
    );

    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const activeTabElement =
        activeTabUuid === undefined ? undefined : targets[activeTabUuid];
    // The slots widen the tabs past a narrow screen: keep the active one seen.
    // Only the slots arriving or another tab moves it; a filter switch never does
    useEffect(() => {
        if (activeTabElement) scrollTabIntoList(activeTabElement);
    }, [activeTabElement]);

    const counts = useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (rule === null) return {};
        return activeFieldId === null
            ? getTabCounts(
                  rule,
                  tiles,
                  dashboardTabs,
                  fieldsByTile,
                  sqlColumnsByTile,
              )
            : getTabCountsForField(
                  rule,
                  activeFieldId,
                  tiles,
                  dashboardTabs,
                  fieldsByTile,
                  sqlColumnsByTile,
              );
    }, [
        rule,
        activeFieldId,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
    ]);

    // Every tile on the tab: no count is wider, so none reflows the tabs
    const reserves = useMemo(
        () =>
            Object.fromEntries(
                dashboardTabs.map((tab) => {
                    const n = getTilesOnTab(
                        dashboardTiles ?? [],
                        dashboardTabs,
                        tab.uuid,
                    ).length;
                    return [
                        tab.uuid,
                        interpolateUiString(
                            getUiString('filters.rail.tabFraction'),
                            { applied: n, total: n },
                        ),
                    ];
                }),
            ),
        [dashboardTiles, dashboardTabs, getUiString],
    );

    if (!isEnabled) return null;

    // A SQL column goes by its own name, never by a field's
    const subject =
        rule === null || activeFieldId === null
            ? getUiString('filters.rail.thisFilter')
            : isSqlColumnRow(rule, activeFieldId)
              ? activeFieldId
              : (toDashboardFilterableField(fieldsMap[activeFieldId])?.label ??
                activeFieldId);

    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                if (!element) return null;
                // No filter, or a placeholder that reaches no tile: the slot stays, empty
                const count =
                    rule === null || isPlaceholder ? null : counts[tab.uuid];
                const isReached = !!count && count.applied > 0;
                const isFieldActive = activeFieldId !== null;
                const countValues = count && {
                    applied: count.applied,
                    total: count.total,
                };
                return createPortal(
                    <Tooltip
                        fz="xs"
                        disabled={!count || count.total === 0}
                        label={
                            countValues &&
                            interpolateUiString(
                                getUiString(
                                    countValues.total === 1
                                        ? 'filters.rail.tabCountTooltip.singular'
                                        : 'filters.rail.tabCountTooltip.plural',
                                ),
                                { ...countValues, subject },
                            )
                        }
                    >
                        <Text
                            component="span"
                            fz="xs"
                            // Tabs the active field reaches stand out
                            c={isReached && isFieldActive ? 'blue' : 'dimmed'}
                            data-reached={isReached}
                            data-field-active={isFieldActive}
                            data-reserve={reserves[tab.uuid]}
                            data-capped={!isViewer || undefined}
                            className={classes.count}
                        >
                            {countValues && (
                                <>
                                    <span aria-hidden="true">
                                        {interpolateUiString(
                                            getUiString(
                                                'filters.rail.tabFraction',
                                            ),
                                            countValues,
                                        )}
                                    </span>
                                    <VisuallyHidden>
                                        {interpolateUiString(
                                            getUiString('filters.rail.countOf'),
                                            countValues,
                                        )}
                                    </VisuallyHidden>
                                </>
                            )}
                        </Text>
                    </Tooltip>,
                    element,
                    tab.uuid,
                );
            })}
        </>
    );
};
