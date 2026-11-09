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
import { getParameterTabCounts } from './parameterPeers';
import { getTakeableTabCounts, getTilesOnTab } from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useDateZoomMapping } from './useDateZoomMapping';
import { useParameterMapping } from './useParameterMapping';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

// Mantine renders each tab with id "<tabsId>-tab-<value>"; value is the tab uuid
const getTabSelector = (tabUuid: string) =>
    `[role="tab"][id$="-tab-${tabUuid}"]`;
// An editor's quiet tab has one trailing slot, shared with its menu
const getTabSlotSelector = (tabUuid: string) =>
    `${getTabSelector(tabUuid)} > [data-position='right']`;

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

type Props = {
    /** The app's quiet tabs: an editor's count shares each tab's trailing slot with its menu. */
    hasTabSlots?: boolean;
};

export const TabCounts: FC<Props> = ({ hasTabSlots = false }) => {
    const getUiString = useUiStrings();
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    const rule = editingRule;
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    const parameterMapping = useParameterMapping();
    const dateZoomMapping = useDateZoomMapping();
    // A parameter control's or a date zoom's tiles, chosen in edit mode
    const controlMapping = parameterMapping ?? dateZoomMapping;

    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // An editor's tabs keep the slots at rest, so mapping reflows none; a
    // viewer never maps, so never gets them
    const isEnabled = dashboardTabs.length > 0 && !isViewer;
    // An embed editor's plain tabs have no slot: the count goes in the tab
    const isInSlot = hasTabSlots && !isViewer;
    const targets = usePortalTargets(
        tabUuids,
        isInSlot ? getTabSlotSelector : getTabSelector,
        isEnabled,
        // A filter open: the menu beside each count is inert
        isInSlot && (rule !== null || controlMapping !== null),
    );

    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const activeTabElement =
        activeTabUuid === undefined ? undefined : targets[activeTabUuid];
    // The slots widen the tabs past a narrow screen: keep the active one seen.
    // Only the slots arriving or another tab moves it; a filter switch never does
    useEffect(() => {
        if (activeTabElement)
            scrollTabIntoList(
                activeTabElement.closest('[role="tab"]') ?? activeTabElement,
            );
    }, [activeTabElement]);

    // The whole filter, whichever chip is hovered or selected, over the tiles
    // that can take it: the tabs add up to the mapping row's "of m"
    const counts = useMemo(() => {
        if (controlMapping !== null) {
            const takeable = new Set(controlMapping.takeableTileUuids);
            const set = new Set(controlMapping.setTileUuids);
            return getParameterTabCounts({
                tiles: dashboardTiles ?? [],
                tabs: dashboardTabs,
                isTakeable: (uuid) => takeable.has(uuid),
                isSet: (uuid) => set.has(uuid),
            });
        }
        if (rule === null) return {};
        return getTakeableTabCounts(
            rule,
            dashboardTiles ?? [],
            dashboardTabs,
            fieldsByTile,
            sqlColumnsByTile,
        );
    }, [
        rule,
        dashboardTiles,
        dashboardTabs,
        fieldsByTile,
        sqlColumnsByTile,
        controlMapping,
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
                            getUiString('controls.tabFraction'),
                            { applied: n, total: n },
                        ),
                    ];
                }),
            ),
        [dashboardTiles, dashboardTabs, getUiString],
    );

    if (!isEnabled) return null;

    const subject = getUiString('controls.thisFilter');

    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                if (!element) return null;
                // Counts show only while tiles are chosen: the slot stays, empty
                const count =
                    controlMapping !== null
                        ? counts[tab.uuid]
                        : rule === null || isPlaceholder || !isMapping
                          ? null
                          : counts[tab.uuid];
                const isReached = !!count && count.applied > 0;
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
                                parameterMapping !== null
                                    ? // Editors only map parameters
                                      countValues.total === 1
                                        ? '{applied} of {total} tile on this tab is set by {subject}'
                                        : '{applied} of {total} tiles on this tab are set by {subject}'
                                    : dateZoomMapping !== null
                                      ? // and date zooms
                                        countValues.total === 1
                                          ? '{applied} of {total} tile on this tab is zoomed by {subject}'
                                          : '{applied} of {total} tiles on this tab are zoomed by {subject}'
                                      : getUiString(
                                            countValues.total === 1
                                                ? 'controls.tabCountTooltip.singular'
                                                : 'controls.tabCountTooltip.plural',
                                        ),
                                {
                                    ...countValues,
                                    subject: controlMapping?.name ?? subject,
                                },
                            )
                        }
                    >
                        <Text
                            component="span"
                            fz="xs"
                            c="dimmed"
                            data-reached={isReached}
                            data-reserve={reserves[tab.uuid]}
                            data-capped={!isViewer || undefined}
                            data-controls-overlay={isInSlot || undefined}
                            className={classes.count}
                        >
                            {countValues && (
                                <>
                                    <span aria-hidden="true">
                                        {interpolateUiString(
                                            getUiString('controls.tabFraction'),
                                            countValues,
                                        )}
                                    </span>
                                    <VisuallyHidden>
                                        {interpolateUiString(
                                            getUiString('controls.countOf'),
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
