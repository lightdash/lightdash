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
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { useFilterableItemsMap } from '../dashboardFilters/FilterRequirements/useFilterableItemsMap';
import { useEligibleZoomTiles } from '../dateZoom/hooks';
import {
    getEffectiveTabUuid,
    getTabCounts,
    getTabCountsForField,
    isSqlColumnRow,
} from './peers';
import classes from './TabCounts.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { toDashboardFilterableField } from './useFilterRuleField';
import { useHoveredFilterRule } from './useHoveredFilterRule';
import { useHoveredZoomUuid } from './useHoveredZoomUuid';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';
import { findZoomControl } from './zoomState';

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

// A date zoom's badges: of the tiles on each tab a zoom can reach, the ones
// in it. A hovered zoom row is blue, as a hovered filter row is
const ZoomTabCounts: FC<{ controlUuid: string; isHovered: boolean }> = ({
    controlUuid,
    isHovered,
}) => {
    const getUiString = useUiStrings();
    const config = useDashboardDateZoomConfig();
    const eligibleTiles = useEligibleZoomTiles(config, controlUuid);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    const targets = usePortalTargets(
        tabUuids,
        getTabSelector,
        dashboardTabs.length > 0,
        false,
    );
    const name = findZoomControl(config, controlUuid)?.name ?? '';
    return (
        <>
            {dashboardTabs.map((tab) => {
                const element = targets[tab.uuid];
                const onTab = eligibleTiles.filter(
                    ({ tile }) =>
                        getEffectiveTabUuid(tile, dashboardTabs) === tab.uuid,
                );
                if (!element || onTab.length === 0) return null;
                const applied = onTab.filter(
                    ({ tile }) =>
                        config.tileTargets[tile.uuid]?.controlUuid ===
                        controlUuid,
                ).length;
                const isReached = applied > 0;
                return createPortal(
                    <Tooltip
                        fz="xs"
                        label={`${applied} of ${onTab.length} ${
                            onTab.length === 1 ? 'tile' : 'tiles'
                        } on this tab ${applied === 1 ? 'uses' : 'use'} ${name}`}
                    >
                        <Badge
                            size="xs"
                            variant={isReached ? 'light' : 'transparent'}
                            color={isReached && isHovered ? 'blue' : 'gray'}
                            data-reached={isReached}
                            data-field-active={isHovered}
                            className={classes.count}
                        >
                            {interpolateUiString(
                                getUiString('filters.rail.countOf'),
                                { applied, total: onTab.length },
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

// A hovered row wins over the edited control, as for filters
export const TabCounts: FC = () => {
    const hoveredZoomUuid = useHoveredZoomUuid();
    const isFilterHovered = useHoveredFilterRule() !== null;
    const editedZoomUuid = useControlsSidebarSelector(
        (c) => c.editingZoom?.uuid ?? null,
    );
    if (hoveredZoomUuid !== null)
        return <ZoomTabCounts controlUuid={hoveredZoomUuid} isHovered />;
    if (editedZoomUuid !== null && !isFilterHovered)
        return <ZoomTabCounts controlUuid={editedZoomUuid} isHovered={false} />;
    return <FilterTabCounts />;
};

const FilterTabCounts: FC = () => {
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
    // The edited filter's badges, never a hovered row's: a hover scrolls nothing
    const editedRuleId =
        editedRule !== null && !isEditedPlaceholder ? editedRule.id : null;
    const activeTabElement =
        editedRuleId === null || activeTabUuid === undefined
            ? undefined
            : targets[activeTabUuid];
    // The badges widen the tabs past a narrow screen: keep the active one seen
    useEffect(() => {
        if (activeTabElement) scrollTabIntoList(activeTabElement);
    }, [activeTabElement, editedRuleId]);

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
