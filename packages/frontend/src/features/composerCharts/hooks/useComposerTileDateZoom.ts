import { resolveTileDateZoom, type DateZoom } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    selectControlGranularities,
    selectDateZoomGranularity,
    useDashboardDateZoomConfig,
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

/** Reports whether the run re-grained the tile, as classic chart tiles do. */
export const useReportComposerTileDateZoomApplied = (
    tileUuid: string,
    dateZoomApplied: boolean | undefined,
) => {
    const setTilesWithDateZoomApplied = useDashboardContext(
        (c) => c.setTilesWithDateZoomApplied,
    );
    useEffect(() => {
        if (dateZoomApplied === undefined) return;
        setTilesWithDateZoomApplied((prev) => {
            const next = new Set(prev ?? []);
            if (dateZoomApplied) next.add(tileUuid);
            else next.delete(tileUuid);
            return next;
        });
    }, [dateZoomApplied, tileUuid, setTilesWithDateZoomApplied]);
};
