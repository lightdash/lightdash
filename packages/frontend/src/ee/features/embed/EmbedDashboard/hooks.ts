import type { ApiError, EmbedDashboard } from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useDashboardRefresh } from '../../../../hooks/dashboard/useDashboardRefresh';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import { postEmbedDashboard } from './api';

const EMBED_DASHBOARD_QUERY_KEY = 'embed-dashboard';

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
        queryKey: [
            EMBED_DASHBOARD_QUERY_KEY,
            projectUuid,
            paletteUuid,
            dashboardUuid,
        ],
        queryFn: () =>
            postEmbedDashboard(lightdashApi, projectUuid!, { paletteUuid }),
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

// Reloads the saved dashboard in place when the host changes `refreshKey`,
// so the viewer's filters and active tab survive. Waits out edit mode.
export const useEmbedDashboardRefreshKey = (
    refreshKey: number | undefined,
    isEditMode: boolean,
) => {
    const queryClient = useQueryClient();
    const { invalidateDashboardRelatedQueries } = useDashboardRefresh();
    const appliedRefreshKeyRef = useRef(refreshKey);
    useEffect(() => {
        if (isEditMode || refreshKey === appliedRefreshKeyRef.current) return;
        appliedRefreshKeyRef.current = refreshKey;
        void queryClient.invalidateQueries({
            queryKey: [EMBED_DASHBOARD_QUERY_KEY],
        });
        // SQL chart results re-key on the chart's lastUpdatedAt
        void queryClient.invalidateQueries({ queryKey: ['savedSqlChart'] });
        void invalidateDashboardRelatedQueries();
    }, [
        invalidateDashboardRelatedQueries,
        isEditMode,
        queryClient,
        refreshKey,
    ]);
};
