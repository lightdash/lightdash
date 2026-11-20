import {
    resolveTileDateZoom,
    type ComposerChartRunResults,
    type DateZoom,
} from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import {
    dashboardDateZoomActions,
    selectControlGranularities,
    selectDateZoomGranularity,
    useDashboardDateZoomConfig,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../dashboard/store';

/** The date zoom a composer tile asks its run for; the server picks each node's date field when the tile has no target. */
export const useComposerTileDateZoom = (tileUuid: string): DateZoom | null => {
    const config = useDashboardDateZoomConfig();
    const runtimeGranularities = useDashboardSelector(
        selectControlGranularities,
    );
    const globalGranularity = useDashboardSelector(selectDateZoomGranularity);
    return useMemo(
        () =>
            resolveTileDateZoom({
                config,
                tileUuid,
                runtimeGranularities,
                globalGranularity,
                defaultXAxisFieldId: undefined,
            }) ?? null,
        [config, tileUuid, runtimeGranularities, globalGranularity],
    );
};

/** Reports the tile's zoomable fields and whether the run re-grained it, as classic chart tiles do. */
export const useReportComposerTileDateZoom = (
    tileUuid: string,
    run:
        | Pick<ComposerChartRunResults, 'dateZoomApplied' | 'zoomableFields'>
        | undefined,
) => {
    const dispatch = useDashboardDispatch();
    useEffect(() => {
        if (!run) return;
        dispatch(
            dashboardDateZoomActions.setChartZoomableFields({
                tileUuid,
                fields: run.zoomableFields,
            }),
        );
        dispatch(
            dashboardDateZoomActions.setTileDateZoomApplied({
                tileUuid,
                isApplied: run.dateZoomApplied,
            }),
        );
    }, [dispatch, run, tileUuid]);
};
