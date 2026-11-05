import { useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { getSavedDateZoomSettings } from './dashboardEditReducer';
import {
    selectDateZoomConfig,
    selectDateZoomGranularities,
    selectDefaultDateZoomGranularity,
    selectEditedRequiredFiltersNote,
    selectHasDateZoomConfigChanged,
} from './dashboardEditSelectors';
import { useDashboardSelector } from './hooks';

/** Saved date zoom settings of the query-loaded or embedded dashboard */
const useSavedDateZoomSettings = () => {
    const config = useDashboardContext((c) => c.dashboard?.config);
    return useMemo(() => getSavedDateZoomSettings(config), [config]);
};

export const useDashboardDateZoomConfig = () => {
    const saved = useSavedDateZoomSettings().dateZoomConfig;
    return useDashboardSelector((state) => selectDateZoomConfig(state, saved));
};

export const useHasDateZoomConfigChanged = () => {
    const saved = useSavedDateZoomSettings().dateZoomConfig;
    return useDashboardSelector((state) =>
        selectHasDateZoomConfigChanged(state, saved),
    );
};

export const useDashboardDateZoomGranularities = () => {
    const saved = useSavedDateZoomSettings().dateZoomGranularities;
    return useDashboardSelector((state) =>
        selectDateZoomGranularities(state, saved),
    );
};

export const useDefaultDateZoomGranularity = () => {
    const saved = useSavedDateZoomSettings().defaultDateZoomGranularity;
    return useDashboardSelector((state) =>
        selectDefaultDateZoomGranularity(state, saved),
    );
};

/** Unsaved edits win over the saved config value */
export const useRequiredFiltersNote = () => {
    const savedNote = useDashboardContext(
        (c) => c.dashboard?.config?.requiredFiltersNote,
    );
    const editedNote = useDashboardSelector(selectEditedRequiredFiltersNote);
    return editedNote ?? savedNote;
};
