import { useMemo, type FC } from 'react';
import {
    emptyDashboardFilters,
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardTiles,
    selectDashboardWideParameterValues,
    selectDateZoomGranularity,
    selectParameterControlInputs,
    selectTileParameterReferences,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import { getDashboardExportTileParameters } from '../../../../../features/dashboard/store/parameterControls';
import { type DashboardContentState } from '../../events/types';
import { useEmbedContentStateEvent } from '../../hooks/useEmbedContentStateEvent';

// Same values the embed's own exports send, so hosts can export what the user sees
const EmbedDashboardContentStateEvent: FC<{ dashboardUuid: string }> = ({
    dashboardUuid,
}) => {
    const areFiltersApplied = useDashboardSelector(
        (state) => selectDashboardFilters(state) !== emptyDashboardFilters,
    );
    const filters = useDashboardAllFilters();
    const parameters = useDashboardSelector(selectDashboardWideParameterValues);
    const controlInputs = useDashboardSelector(selectParameterControlInputs);
    const tileParameterReferences = useDashboardSelector(
        selectTileParameterReferences,
    );
    const tiles = useDashboardSelector(selectDashboardTiles);
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);

    const state = useMemo<DashboardContentState | null>(() => {
        if (!areFiltersApplied) return null;
        return {
            type: 'dashboard',
            dashboardUuid,
            filters,
            parameters,
            tileParameters:
                getDashboardExportTileParameters({
                    controlInputs,
                    tileUuids: (tiles ?? []).map(({ uuid }) => uuid),
                    tileParameterReferences,
                }) ?? null,
            dateZoomGranularity: dateZoomGranularity ?? null,
            activeTabUuid: activeTabUuid ?? null,
        };
    }, [
        activeTabUuid,
        areFiltersApplied,
        controlInputs,
        dashboardUuid,
        dateZoomGranularity,
        filters,
        parameters,
        tileParameterReferences,
        tiles,
    ]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedDashboardContentStateEvent;
