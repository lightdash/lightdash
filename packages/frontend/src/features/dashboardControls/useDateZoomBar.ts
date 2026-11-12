import {
    getControlActiveGranularity,
    getTileControl,
    type DateZoomControl,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectActiveTabUuid,
    selectChartZoomableFieldsByTileUuid,
    selectControlGranularities,
    selectControlSections,
    selectDashboardTabs,
    selectDashboardTiles,
    selectIsDateZoomDisabled,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { getZoomSectionId, getZoomTileUuids } from './dateZoomControls';
import { getTabTileUuids, isControlShownOnTab } from './parameterControlsBar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

export type DateZoomBarEntry = {
    /** As saved, or as added. */
    control: DateZoomControl;
    /** Unsectioned when it has none or it is gone. */
    sectionId: string | null;
    /** The tiles it re-grains. */
    tileUuids: string[];
    /** What its tiles show: a viewer's pick, else the saved grain. */
    granularity: string;
    /** Hidden from viewers, by itself or with every date zoom. */
    isHidden: boolean;
    /** Started from "Add": a draft pill until Apply. */
    isNew: boolean;
};

/** The named date zooms with a pill on the tab in view, in list order, then a new one */
export const useDateZoomBar = (): DateZoomBarEntry[] => {
    const config = useDashboardDateZoomConfig();
    const controlGranularities = useDashboardSelector(
        selectControlGranularities,
    );
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const sections = useDashboardSelector(selectControlSections);
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const newZoom = useDateZoomEditorSelector((c) => c.newZoom);
    return useMemo(() => {
        const tabTileUuids = getTabTileUuids(tiles ?? [], tabs, activeTabUuid);
        const toEntry = (
            control: DateZoomControl,
            isNew: boolean,
        ): DateZoomBarEntry => ({
            control,
            sectionId: getZoomSectionId(control, sections),
            tileUuids: getZoomTileUuids(config.tileTargets, control.uuid),
            granularity: getControlActiveGranularity(
                control,
                controlGranularities,
            ),
            isHidden: control.hidden === true || isDateZoomDisabled,
            isNew,
        });
        return [
            ...config.controls.map((control) => toEntry(control, false)),
            ...(newZoom === null ? [] : [toEntry(newZoom, true)]),
        ].filter(
            (entry) =>
                !(isViewer && entry.isHidden) &&
                (entry.isNew ||
                    isControlShownOnTab(entry.tileUuids, tabTileUuids)),
        );
    }, [
        config,
        controlGranularities,
        isDateZoomDisabled,
        sections,
        tiles,
        tabs,
        activeTabUuid,
        isViewer,
        newZoom,
    ]);
};

/** Named date zooms the user sees, as saved (a draft one doesn't count) */
export const useNamedDateZoomCount = (): number =>
    useDateZoomBar().filter(({ isNew }) => !isNew).length;

/** Tiles the default zoom governs: zoomable tiles no named zoom has, as the shipped Default counts them */
export const useDefaultZoomTileCount = (): number => {
    const config = useDashboardDateZoomConfig();
    const chartZoomableFieldsByTileUuid = useDashboardSelector(
        selectChartZoomableFieldsByTileUuid,
    );
    return useMemo(
        () =>
            Object.entries(chartZoomableFieldsByTileUuid)
                .filter(([, fields]) => fields.length > 0)
                .filter(([uuid]) => !getTileControl(config, uuid)).length,
        [chartZoomableFieldsByTileUuid, config],
    );
};
