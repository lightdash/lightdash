import type { ApiError, EmbedDashboard } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import { postEmbedDashboard } from './api';

export const useEmbedDashboard = (
    projectUuid: string | undefined,
    paletteUuid?: string,
    enabled: boolean = true,
    // The token names the dashboard for dashboard embeds; an AI-agent embed
    // names it per request, so it must key the cache.
    dashboardUuid?: string,
) => {
    return useQuery<EmbedDashboard, ApiError>({
        queryKey: ['embed-dashboard', projectUuid, paletteUuid, dashboardUuid],
        queryFn: () => postEmbedDashboard(projectUuid!, { paletteUuid }),
        enabled: !!projectUuid && enabled,
        // Inherits the app-wide retry policy: transient NetworkErrors retry
        // with backoff; real API errors (e.g. expired JWT) surface at once.
    });
};

// Embedded tiles run with the dashboard's saved parameters, so the controls need them too
export const useEmbedSavedParameters = (
    dashboard: Pick<EmbedDashboard, 'parameters'> | undefined,
) => {
    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    useEffect(() => {
        if (dashboard) {
            setSavedParameters(dashboard.parameters ?? {});
        }
    }, [dashboard, setSavedParameters]);
};
