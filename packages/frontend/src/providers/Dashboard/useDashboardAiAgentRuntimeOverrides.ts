import {
    type AiDashboardRuntimeOverrides,
    type DashboardFilters,
    type DateZoom,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    addActiveTabToDashboardRuntimeOverrides,
    getDashboardParametersValuesMap,
    getNonDefaultDashboardRuntimeOverrides,
} from '../../ee/features/aiCopilot/store/dashboardPageContext';
import {
    selectActiveTab,
    selectDateZoomGranularity,
    selectIsDateZoomDisabled,
    selectParameterValues,
    useDashboardAllFilters,
    useDashboardSelector,
    useDefaultDateZoomGranularity,
} from '../../features/dashboard/store';
import useDashboardContext from './useDashboardContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

// The on-screen view state that differs from the saved dashboard, for AI prompts.
export const useDashboardAiAgentRuntimeOverrides =
    (): AiDashboardRuntimeOverrides | null => {
        const dashboard = useDashboardContext((c) => c.dashboard);
        const activeTab = useDashboardSelector(selectActiveTab);
        const allFilters = useDashboardAllFilters();
        const originalDashboardFilters = dashboard?.filters ?? emptyFilters;
        const parameterValues = useDashboardSelector(selectParameterValues);
        const dateZoomGranularity = useDashboardSelector(
            selectDateZoomGranularity,
        );
        const defaultDateZoomGranularity = useDefaultDateZoomGranularity();
        const isDateZoomDisabled = useDashboardSelector(
            selectIsDateZoomDisabled,
        );

        const defaultParameterValues = useMemo(
            () => getDashboardParametersValuesMap(dashboard?.parameters ?? {}),
            [dashboard?.parameters],
        );
        const defaultDateZoom = useMemo<DateZoom | null>(
            () =>
                defaultDateZoomGranularity && !isDateZoomDisabled
                    ? { granularity: defaultDateZoomGranularity }
                    : null,
            [defaultDateZoomGranularity, isDateZoomDisabled],
        );
        const effectiveDateZoom = useMemo<DateZoom | null>(
            () =>
                dateZoomGranularity
                    ? { granularity: dateZoomGranularity }
                    : null,
            [dateZoomGranularity],
        );

        return useMemo(
            () =>
                addActiveTabToDashboardRuntimeOverrides({
                    activeTab,
                    runtimeOverrides: getNonDefaultDashboardRuntimeOverrides({
                        defaultFilters: originalDashboardFilters,
                        effectiveFilters: allFilters,
                        defaultParameters: defaultParameterValues,
                        effectiveParameters: parameterValues,
                        defaultDateZoom,
                        effectiveDateZoom,
                    }),
                }),
            [
                activeTab,
                allFilters,
                defaultDateZoom,
                defaultParameterValues,
                effectiveDateZoom,
                originalDashboardFilters,
                parameterValues,
            ],
        );
    };
