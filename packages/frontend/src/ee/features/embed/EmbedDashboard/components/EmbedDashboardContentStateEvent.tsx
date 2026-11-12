import { useMemo, type FC } from 'react';
import {
    emptyDashboardFilters,
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    selectEmbedDashboard,
    selectIsAddFilterDisabled,
    selectIsDateZoomDisabled,
    selectSavedParameters,
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
    const savedFilters = useDashboardSelector(selectDashboardFilters);
    const tabs = useDashboardSelector(selectDashboardTabs);
    const savedParameters = useDashboardSelector(selectSavedParameters);
    const savedConfig = useDashboardSelector(
        (state) => selectEmbedDashboard(state)?.config,
    );
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);

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
            dashboard: {
                tiles: tiles ?? [],
                tabs,
                filters: savedFilters,
                parameters: savedParameters,
                config: {
                    ...savedConfig,
                    isDateZoomDisabled,
                    isAddFilterDisabled,
                },
            },
        };
    }, [
        activeTabUuid,
        areFiltersApplied,
        controlInputs,
        dashboardUuid,
        dateZoomGranularity,
        filters,
        isAddFilterDisabled,
        isDateZoomDisabled,
        parameters,
        savedConfig,
        savedFilters,
        savedParameters,
        tabs,
        tileParameterReferences,
        tiles,
    ]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedDashboardContentStateEvent;
