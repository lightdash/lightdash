import { type DashboardVersionedFields } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    emptyDashboardFilters,
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardWideParameterValues,
    selectDateZoomGranularity,
    selectParameterControlInputs,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import { getDashboardExportTileParameters } from '../../../../../features/dashboard/store/parameterControls';
import { type DashboardContentState } from '../../events/types';
import { useEmbedContentStateEvent } from '../../hooks/useEmbedContentStateEvent';

// Same values the embed's own exports send, so hosts can export what the user sees
const EmbedDashboardContentStateEvent: FC<{
    dashboardUuid: string;
    dashboardVersion: DashboardVersionedFields;
}> = ({ dashboardUuid, dashboardVersion }) => {
    const areFiltersApplied = useDashboardSelector(
        (state) => selectDashboardFilters(state) !== emptyDashboardFilters,
    );
    const parameters = useDashboardSelector(selectDashboardWideParameterValues);
    const controlInputs = useDashboardSelector(selectParameterControlInputs);
    const tileParameterReferences = useDashboardSelector(
        selectTileParameterReferences,
    );
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);

    const state = useMemo<DashboardContentState | null>(() => {
        if (!areFiltersApplied) return null;
        const tileParameters = getDashboardExportTileParameters({
            controlInputs,
            tileUuids: dashboardVersion.tiles.flatMap(({ uuid }) =>
                uuid ? [uuid] : [],
            ),
            tileParameterReferences,
        });
        return {
            type: 'dashboard',
            dashboardUuid,
            activeTabUuid: activeTabUuid ?? null,
            dashboard: dashboardVersion,
            exportRequest: {
                parameters,
                ...(tileParameters && { tileParameters }),
                ...(dateZoomGranularity && { dateZoomGranularity }),
            },
        };
    }, [
        activeTabUuid,
        areFiltersApplied,
        controlInputs,
        dashboardUuid,
        dashboardVersion,
        dateZoomGranularity,
        parameters,
        tileParameterReferences,
    ]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedDashboardContentStateEvent;
