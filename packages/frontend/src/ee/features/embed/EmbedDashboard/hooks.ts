import type {
    ApiError,
    DashboardParameters,
    EmbedDashboard,
    ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { postEmbedDashboard } from './api';

export const useEmbedDashboard = (
    projectUuid: string | undefined,
    paletteUuid?: string,
    enabled: boolean = true,
    // The token names the dashboard for dashboard embeds; an AI-agent embed
    // names it per request, so it must key the cache.
    dashboardUuid?: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<EmbedDashboard, ApiError>({
        queryKey: ['embed-dashboard', projectUuid, paletteUuid, dashboardUuid],
        queryFn: () =>
            postEmbedDashboard(lightdashApi, projectUuid!, { paletteUuid }),
        enabled: !!projectUuid && enabled,
        // Inherits the app-wide retry policy: transient NetworkErrors retry
        // with backoff; real API errors (e.g. expired JWT) surface at once.
    });
};

const toDashboardParameters = (
    values: ParametersValuesMap,
): DashboardParameters =>
    Object.fromEntries(
        Object.entries(values).map(([parameterName, value]) => [
            parameterName,
            { parameterName, value },
        ]),
    );

// Embedded tiles run with the dashboard's saved parameters, so the controls need them too.
// The token's values sit over them in view mode; edit mode keeps them out of what gets saved.
export const useEmbedSavedParameters = (
    dashboard:
        | (Pick<EmbedDashboard, 'parameters'> &
              Partial<Pick<EmbedDashboard, 'parameterInteractivity'>>)
        | undefined,
    isEditMode: boolean = false,
) => {
    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    const setParameterPicks = useDashboardContext((c) => c.setParameterPicks);
    useEffect(() => {
        if (!dashboard) return;
        const tokenValues = isEditMode
            ? undefined
            : dashboard.parameterInteractivity?.values;
        setSavedParameters({
            ...dashboard.parameters,
            ...(tokenValues && toDashboardParameters(tokenValues)),
        });
        // Controls read picks, like a scheduled delivery's values
        if (tokenValues && Object.keys(tokenValues).length > 0) {
            setParameterPicks((picks) => ({ ...picks, ...tokenValues }));
        }
    }, [dashboard, isEditMode, setSavedParameters, setParameterPicks]);
};
